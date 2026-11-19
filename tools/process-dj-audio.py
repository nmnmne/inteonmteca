"""Build sample-aligned lossless DJ masters, or verify an existing build with --check."""

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREFIX = "window.DJ_LOUDNESS = "
RECIPE = "r128-stereo-v1"
TARGET_I = -14.0
TARGET_TP = -1.0
LIMITER_TP = -1.35  # Guard against reconstruction overshoot after returning to source rate.
TOLERANCE = 0.25


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(program, *arguments):
    command = [program, *map(str, arguments)]
    process = subprocess.run(command, capture_output=True, encoding="utf-8", errors="replace")
    if process.returncode:
        raise RuntimeError(f"{program} failed: {process.stderr[-2400:]}")
    return process


def audio_stream(path):
    data = run("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
               "stream=sample_rate,channels,time_base,duration_ts,bits_per_raw_sample,codec_name",
               "-of", "json", path).stdout
    stream, = json.loads(data)["streams"]
    return stream


def probe(path):
    stream = audio_stream(path)
    rate = int(stream["sample_rate"])
    if stream["channels"] != 2 or stream["time_base"] != f"1/{rate}":
        raise ValueError(f"Expected a sample-timed stereo source: {path}")
    return rate, int(stream["duration_ts"]), stream["codec_name"], int(stream.get("bits_per_raw_sample") or 0)


@contextmanager
def stereo_source(path):
    stream = audio_stream(path)
    if (stream["codec_name"] == "flac" and stream["channels"] == 2 and stream.get("duration_ts")
            and stream["time_base"] == f"1/{stream['sample_rate']}"):
        yield path
        return
    # Duration tags for compressed streams can include encoder priming. Decode once to
    # recover the actual sample count and to meter exactly the stereo mix that we master.
    # Floating point preserves peaks above full scale when downmixing surround sources.
    with tempfile.TemporaryDirectory(prefix="inteon-stereo-") as temp_dir:
        decoded = Path(temp_dir) / "stereo.wav"
        run("ffmpeg", "-nostdin", "-v", "error", "-threads", 1, "-i", path, "-map", "0:a:0",
            "-map_metadata", "-1", "-ac", 2, "-c:a", "pcm_f32le", "-rf64", "auto", decoded)
        yield decoded


def measure(path):
    # True-peak mode oversamples the decoded signal. Quiet frame logs leave one whole-track summary.
    stderr = run("ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-loglevel", "info", "-threads", 1,
                 "-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=verbose",
                 "-f", "null", "-").stderr
    summary = stderr.rsplit("Summary:", 1)[-1]
    values = []
    for label in ("I", "Peak", "LRA"):
        match = re.search(r"^\s*" + label + r":\s*([-+\d.inf]+)", summary, re.MULTILINE)
        if not match or not math.isfinite(float(match[1])):
            raise ValueError(f"No measurable {label} in {path.name}")
        values.append(float(match[1]))
    return values


def render(source, dest, rate, frames, gain, limiter, ceiling):
    filters = [f"volume={gain:.4f}dB:precision=double"]
    if limiter:
        filters.extend([
            f"aresample={rate * 4}:resampler=soxr:precision=28",
            f"alimiter=limit={10 ** (ceiling / 20):.8f}:attack=5:release=80:level=false:latency=true",
            f"aresample={rate}:resampler=soxr:precision=28",
            f"apad=whole_len={frames}", f"atrim=end_sample={frames}",
        ])
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-threads", 1, "-i", source,
        "-map", "0:a:0", "-map_metadata", "-1", "-filter_threads", 1, "-af", ",".join(filters),
        "-c:a", "flac", "-compression_level", 5, "-sample_fmt", "s32", "-bits_per_raw_sample", 24,
        "-flags:a", "+bitexact", "-f", "flac", dest)


def read_manifest(manifest):
    if not manifest.is_file():
        return {}
    data = manifest.read_text(encoding="utf-8").strip()
    if not data.startswith(PREFIX) or not data.endswith(";"):
        raise ValueError(f"Invalid generated manifest: {manifest}")
    return json.loads(data[len(PREFIX):-1])


def scratch_audio(root, record, check):
    # Raw stereo PCM gives an exact byte offset for any playhead position.
    # A deck fetches only the short region on either side of the needle.
    rate = min(record["sampleRate"], 48000)
    frames = round(record["frames"] * rate / record["sampleRate"])
    dest = (root / record["src"]).with_name(f"scratch-v1-{record['sha256'][:24]}.pcm")
    url = dest.relative_to(root).as_posix()
    if (record.get("scratchSrc") == url and record.get("scratchFrames") == frames
            and record.get("scratchRate") == rate and dest.is_file() and dest.stat().st_size == frames * 4
            and sha256(dest) == record.get("scratchHash")):
        return record
    if check:
        raise ValueError(f"Missing or changed scratch audio: {url}")
    with tempfile.NamedTemporaryFile(dir=dest.parent, prefix=".scratch-", suffix=".tmp", delete=False) as handle:
        temp = Path(handle.name)
    try:
        run("ffmpeg", "-nostdin", "-v", "error", "-y", "-threads", 1, "-i", root / record["src"],
            "-map", "0:a:0", "-filter_threads", 1, "-af",
            f"aresample={rate},apad=whole_len={frames},atrim=end_sample={frames}",
            "-ac", 2, "-c:a", "pcm_s16le", "-f", "s16le", temp)
        if temp.stat().st_size != frames * 4:
            raise ValueError(f"Incomplete scratch audio: {url}")
        digest = sha256(temp)
        os.replace(temp, dest)
    finally:
        temp.unlink(missing_ok=True)
    return {**record, "scratchSrc": url, "scratchRate": rate, "scratchFrames": frames, "scratchHash": digest}


def process(root, url, old, check):
    source = root / url
    source_hash = sha256(source)
    filename = f"{RECIPE}-{source_hash[:24]}.flac"
    dest = root / "assets" / "dj-audio" / filename
    src = dest.relative_to(root).as_posix()
    if (old and old.get("sourceHash") == source_hash and old.get("src") == src
            and dest.is_file() and sha256(dest) == old.get("sha256")):
        if check:
            integrated, peak, _ = measure(dest)
            if integrated != old["integrated"] or peak != old["truePeak"]:
                raise ValueError(f"Incorrect loudness metadata: {url}")
            if abs(integrated - TARGET_I) > TOLERANCE or peak > TARGET_TP:
                raise ValueError(f"Out-of-spec master: {url}")
        return scratch_audio(root, old, check)
    if check:
        raise ValueError(f"Missing, changed or unverified DJ master for {url}")
    with stereo_source(source) as decoded:
        record = master(decoded, source_hash, url, dest, src)
    return scratch_audio(root, record, check=False)


def master(source, source_hash, url, dest, src):
    rate, frames, _, _ = probe(source)
    source_i, source_tp, _ = measure(source)
    gain = TARGET_I - source_i
    limiter = source_tp + gain > TARGET_TP - 0.15
    ceiling = LIMITER_TP
    with tempfile.NamedTemporaryFile(dir=dest.parent, prefix=".render-", suffix=".tmp", delete=False) as handle:
        temp = Path(handle.name)
    try:
        for _ in range(5):
            render(source, temp, rate, frames, gain, limiter, ceiling)
            if probe(temp) != (rate, frames, "flac", 24):
                raise ValueError(f"Sample count, rate or encoding changed for {url}")
            integrated, peak, lra = measure(temp)
            if abs(integrated - TARGET_I) <= TOLERANCE and peak <= TARGET_TP - 0.05:
                break
            gain += TARGET_I - integrated
            if peak > TARGET_TP - 0.05:
                limiter = True
                ceiling -= max(0, peak - TARGET_TP) + 0.15
        else:
            raise ValueError(f"Master outside tolerance: {url} ({integrated} LUFS, {peak} dBTP)")
        encoded_hash = sha256(temp)
        os.replace(temp, dest)
    finally:
        temp.unlink(missing_ok=True)
    print(f"{url}  {source_i} -> {integrated} LUFS, {peak} dBTP", flush=True)
    return {"src": src, "integrated": integrated, "truePeak": peak, "lra": lra,
            "gainDb": round(gain, 3), "limited": limiter, "inputIntegrated": source_i, "inputTruePeak": source_tp,
            "sampleRate": rate, "frames": frames, "sourceHash": source_hash, "sha256": encoded_hash}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--playlist", type=Path, help="Candidate playlist JSON (default: ROOT/playlist.json)")
    parser.add_argument("--manifest-dir", type=Path, help="Directory containing the staged JS manifest (default: ROOT)")
    parser.add_argument("--check", action="store_true", help="Re-measure existing masters without modifying any files")
    parser.add_argument("--jobs", type=int, default=min(4, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    root = args.root.resolve()
    manifest = (args.manifest_dir or root).resolve() / "dj-loudness.js"
    playlist = args.playlist or root / "playlist.json"
    urls = [track["audio"] for track in json.loads(playlist.read_text(encoding="utf-8"))]
    old = read_manifest(manifest)
    if args.check and set(urls) != set(old):
        raise ValueError("The generated manifest and playlist have different tracks")
    if not args.check:
        (root / "assets" / "dj-audio").mkdir(parents=True, exist_ok=True)
        manifest.parent.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        records = dict(zip(urls, executor.map(lambda url: process(root, url, old.get(url), args.check), urls)))
    if not args.check:
        data = PREFIX + json.dumps(records, indent=2, ensure_ascii=False) + ";\n"
        if not manifest.is_file() or manifest.read_text(encoding="utf-8") != data:
            with tempfile.NamedTemporaryFile("w", dir=manifest.parent, suffix=".tmp", encoding="utf-8", delete=False) as handle:
                handle.write(data)
            os.replace(handle.name, manifest)
    print(f"{len(records)} DJ masters ready at {TARGET_I:g} LUFS, true-peak ceiling {TARGET_TP:g} dBTP.")


if __name__ == "__main__":
    main()
