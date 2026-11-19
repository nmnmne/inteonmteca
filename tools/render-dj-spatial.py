"""Bake 12-channel 7.1.4 lossless speaker mixes from the level-matched stereo library."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from importlib import import_module
import json
import os
from pathlib import Path
import re
import tempfile


# Share the true-peak meter and file verification with the stereo release tool.
audio = import_module("process-dj-audio")
RECIPE = "speaker-bed-v1"
PREFIX = "window.DJ_SPATIAL_TRACKS = "


def manifest(path, prefix):
    data = path.read_text(encoding="utf-8").strip()
    if not data.startswith(prefix) or not data.endswith(";"):
        raise ValueError(f"Invalid manifest: {path}")
    return json.loads(data[len(prefix):-1])


def channel_graph(preset, rate, frames):
    channels = preset["channels"]
    graphs = ["[0:a:0]aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=12" +
              "".join(f"[s{i}]" for i in range(12))]
    for i, channel in enumerate(channels):
        filters = [f"pan=mono|c0={channel['left']}*c0+{channel['right']}*c1"]
        for kind in ("highpass", "lowpass", "allpass"):
            if kind in channel:
                cutoff = min(channel[kind], rate * .45)
                filters.extend([f"{kind}=f={cutoff}:t=q:w=0.70710678"] * channel.get(kind + "Stages", 1))
        if channel.get("delayMs"):
            filters.append(f"adelay={round(rate * channel['delayMs'] / 1000)}S")
        graphs.append(f"[s{i}]" + ",".join(filters) + f"[ch{i}]")
    mapping = "|".join(f"{i}.0-{channel['speaker']}" for i, channel in enumerate(channels))
    graphs.append("".join(f"[ch{i}]" for i in range(12)) +
                  f"join=inputs=12:channel_layout=7.1.4:map={mapping},atrim=end_sample={frames}")
    return ";".join(graphs)


def measure_matrix(source, graph):
    result = audio.run("ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-threads", 1, "-i", source,
                       "-filter_complex_threads", 1, "-filter_complex",
                       graph + ",ebur128=peak=true:framelog=verbose[meter]", "-map", "[meter]", "-f", "null", "-")
    summary = result.stderr.rsplit("Summary:", 1)[-1]
    return [float(re.search(r"^\s*" + label + r":\s*([-+.\d]+)", summary, re.MULTILINE)[1])
            for label in ("I", "Peak")]


def verify_file(dest, rate, frames):
    info = audio.run("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                     "stream=codec_name,sample_rate,duration_ts,time_base,channels,channel_layout,bits_per_raw_sample",
                     "-of", "json", dest)
    stream, = json.loads(info.stdout)["streams"]
    expected = {"codec_name": "wavpack", "channel_layout": "7.1.4", "channels": 12,
                "bits_per_raw_sample": 24, "sample_rate": str(rate), "time_base": f"1/{rate}", "duration_ts": frames}
    if any(str(stream.get(key)) != str(value) for key, value in expected.items()):
        raise ValueError(f"Unexpected spatial file format: {dest.name}: {stream}")
    return audio.measure(dest)


def process(root, url, stereo, preset, preset_hash, previous, check):
    source = root / stereo["src"]
    source_hash = audio.sha256(source)
    if source_hash != stereo["sha256"]:
        raise ValueError(f"Outdated stereo master: {source}")
    dest = root / "assets" / "dj-spatial" / f"{RECIPE}-{preset_hash[:8]}-{source_hash[:22]}.wv"
    relative = dest.relative_to(root).as_posix()
    rate, frames = stereo["sampleRate"], stereo["frames"]
    if (previous and previous.get("spatialSrc") == relative and dest.is_file() and
            previous.get("sha256") == audio.sha256(dest)):
        if check:
            integrated, peak, _ = verify_file(dest, rate, frames)
            if integrated != previous["integrated"] or peak != previous["truePeak"]:
                raise ValueError(f"Stale spatial measurements: {url}")
        return previous
    if check:
        raise ValueError(f"Missing or outdated 7.1.4 file: {url}")
    graph = channel_graph(preset, rate, frames)
    initial_i, initial_peak = measure_matrix(source, graph)
    gain_db = audio.TARGET_I - initial_i
    ceiling = audio.LIMITER_TP
    limited = initial_peak + gain_db > ceiling
    with tempfile.NamedTemporaryFile(prefix=".render-", suffix=".tmp", dir=dest.parent, delete=False) as handle:
        temp = Path(handle.name)
    try:
        for _ in range(4):
            filters = [f"volume={gain_db:.4f}dB:precision=double"]
            if limited:
                filters.extend([f"aresample={rate * 4}:resampler=soxr:precision=28",
                                f"alimiter=limit={10 ** (ceiling / 20):.8f}:attack=5:release=80:level=false:latency=true",
                                f"aresample={rate}:resampler=soxr:precision=28",
                                f"apad=whole_len={frames}", f"atrim=end_sample={frames}"])
            audio.run("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-threads", 1, "-i", source,
                      "-filter_complex_threads", 1, "-filter_complex", graph + "," + ",".join(filters) + "[bed]",
                      "-map", "[bed]", "-map_metadata", "-1", "-metadata", f"title={Path(url).stem}",
                      "-metadata", "comment=inteonmteca 7.1.4 speaker upmix",
                      "-c:a", "wavpack", "-sample_fmt", "s32p", "-bits_per_raw_sample", 24,
                      "-flags:a", "+bitexact", "-f", "wv", temp)
            integrated, peak, lra = verify_file(temp, rate, frames)
            if abs(integrated - audio.TARGET_I) <= audio.TOLERANCE and peak <= audio.TARGET_TP:
                break
            gain_db += audio.TARGET_I - integrated
            if peak > audio.TARGET_TP:
                limited = True
                ceiling -= max(0.1, peak - audio.TARGET_TP)
        else:
            raise ValueError(f"Spatial loudness target missed for {url}: {integrated} LUFS, {peak} dBTP")
        digest = audio.sha256(temp)
        os.replace(temp, dest)
    finally:
        temp.unlink(missing_ok=True)
    print(f"{url}: 7.1.4, {integrated} LUFS, {peak} dBTP, {dest.stat().st_size // 1048576} MiB", flush=True)
    return {"spatialSrc": relative, "layout": "7.1.4", "channels": 12, "sampleRate": rate, "frames": frames,
            "integrated": integrated, "truePeak": peak, "lra": lra, "bytes": dest.stat().st_size, "sha256": digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--playlist", type=Path, help="Candidate playlist JSON (default: ROOT/playlist.json)")
    parser.add_argument("--manifest-dir", type=Path, help="Read and write generated DJ manifests in this directory")
    parser.add_argument("--jobs", type=int, default=min(4, os.cpu_count() or 1))
    parser.add_argument("--check", action="store_true", help="Re-measure all published spatial files")
    args = parser.parse_args()
    if not 1 <= args.jobs <= 32:
        parser.error("--jobs must be between 1 and 32")
    root = args.root.resolve()
    directory = args.manifest_dir or root
    tracks = json.loads((args.playlist or root / "playlist.json").read_text(encoding="utf-8"))
    stereo = manifest(directory / "dj-loudness.js", "window.DJ_LOUDNESS = ")
    output = directory / "dj-spatial-tracks.js"
    previous = manifest(output, PREFIX) if output.exists() else {}
    urls = [t["audio"] for t in tracks]
    if set(urls) != set(stereo) or (args.check and set(urls) != set(previous)):
        raise ValueError("Rebuild the music manifests before checking spatial assets.")
    settings = root / "assets" / "dj-spatial" / "preset.json"
    preset_hash = sha256(settings.read_bytes()).hexdigest()
    preset = json.loads(settings.read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        rows = dict(zip(urls, pool.map(lambda url: process(root, url, stereo[url], preset, preset_hash,
                                                           previous.get(url), args.check), urls)))
    if not args.check:
        text = PREFIX + json.dumps(rows, ensure_ascii=False, indent=2) + ";\n"
        if not output.exists() or output.read_text(encoding="utf-8") != text:
            with tempfile.NamedTemporaryFile("w", dir=directory, suffix=".tmp", encoding="utf-8", delete=False) as file:
                file.write(text)
            os.replace(file.name, output)
    print(f"Verified {len(rows)} discrete 7.1.4 WavPack masters.")


if __name__ == "__main__":
    main()
