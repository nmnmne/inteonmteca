"""Rebuild the static DJ analysis from playlist.json. Requires FFmpeg and NumPy."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


ROOT = Path(__file__).resolve().parents[1]
RATE = 11025
HOP = 64
WAVE_BINS = 8192
ANALYSIS_VERSION = 1


def read_audio(path):
    pcm = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-map", "0:a:0",
        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1",
    ])
    return np.frombuffer(pcm, dtype="<f4")


def spectra(samples, size, hop):
    """Yield centred, overlapping spectra in bounded batches."""
    frames = sliding_window_view(np.pad(samples, size // 2), size)[::hop]
    window = np.hanning(size).astype(np.float32)
    for offset in range(0, len(frames), 512):
        yield np.abs(np.fft.rfft(frames[offset:offset + 512] * window)).astype(np.float32)


def wave_envelope(samples):
    aligned = np.linspace(0, len(samples), WAVE_BINS + 1, dtype=int)
    # Very short clips repeat source samples where a bin would otherwise be empty.
    if len(samples) < WAVE_BINS:
        return np.abs(np.interp(np.linspace(0, len(samples) - 1, WAVE_BINS),
                                np.arange(len(samples)), samples))
    rms = np.sqrt(np.add.reduceat(samples ** 2, aligned[:-1]) / np.diff(aligned))
    peak = np.maximum.reduceat(np.abs(samples), aligned[:-1])
    return rms * 0.72 + peak * 0.28


def packed(values):
    scale = max(np.percentile(values, 99.8), 1e-5)
    values = np.rint(255 * np.clip(values / scale, 0, 1)).astype(np.uint8)
    return base64.b64encode(values.tobytes()).decode("ascii")


def transients(samples):
    edges = np.array([1, 4, 8, 16, 32, 64, 128, 200])
    bands = []
    bass_energy = []
    for spectrum in spectra(samples, 512, HOP):
        bands.append(np.stack([spectrum[:, a:b].mean(axis=1)
                               for a, b in zip(edges[:-1], edges[1:])], axis=1))
        bass_energy.append(np.linalg.norm(spectrum[:, 1:8], axis=1))
    bands = np.concatenate(bands)
    log_bands = np.log1p(bands / np.maximum(np.percentile(bands, 70, axis=0), 0.002) * 4)
    # Place this two-frame rise at the midpoint of the two spectra.
    flux = np.zeros_like(bands)
    flux[1:-1] = np.maximum(0, log_bands[2:] - log_bands[:-2])
    return flux, np.concatenate(bass_energy)


def beat_grid(flux):
    frames_per_second = RATE / HOP
    envelope = flux @ np.array([0.23, 0.16, 0.08, 0.10, 0.14, 0.16, 0.13])
    centered = envelope - np.mean(envelope)
    n = len(centered)
    if n < frames_per_second * 4 or not centered.any():
        return None, 0
    nfft = 1 << (2 * n - 1).bit_length()
    power = np.abs(np.fft.rfft(centered, n=nfft)) ** 2
    ac = np.fft.irfft(power, n=nfft)[:n]
    ac /= max(ac[0], 1e-9)
    tempos = np.arange(65, 181, 0.05)
    periods = 60 * frames_per_second / tempos
    score = np.zeros_like(tempos)
    lags = np.arange(n)
    for multiple in range(1, 9):
        score += np.interp(periods * multiple, lags, ac) / np.sqrt(multiple)
    # Small tempo preference resolves equivalent half/double-time grids.
    score *= np.exp(-0.16 * np.log2(tempos / 120) ** 2)
    best = int(np.argmax(score))
    if score[best] < 0.12:
        return None, 0

    # Refine the period on prominent transients across the entire recording.
    profile = envelope + 0.32 * flux[:, :2].mean(axis=1)
    peaks = np.flatnonzero((profile[1:-1] >= profile[:-2]) &
                           (profile[1:-1] > profile[2:]) &
                           (profile[1:-1] > np.percentile(profile, 65))) + 1
    if not len(peaks):
        return None, 0
    times = peaks / frames_per_second
    strengths = np.minimum(profile[peaks], np.percentile(profile[peaks], 98))
    phase_bins = 120

    def grid(candidate):
        phase = (times * candidate / 60) % 1
        counts = np.bincount((phase * phase_bins).astype(int), weights=strengths,
                             minlength=phase_bins)
        circular = np.tile(counts, 3)
        window = np.exp(-0.5 * (np.arange(-12, 13) / 3.5) ** 2)
        smoothed = np.convolve(circular, window, mode="same")[phase_bins:2 * phase_bins]
        position = int(np.argmax(smoothed))
        return smoothed[position], (position + 0.5) / phase_bins * 60 / candidate

    trial = np.arange(tempos[best] - 0.65, tempos[best] + 0.651, 0.01)
    scores = [grid(candidate) for candidate in trial]
    idx = max(range(len(trial)), key=lambda i: scores[i][0])
    bpm = round(float(trial[idx]), 2)
    if abs(bpm - round(bpm)) <= 0.035:
        bpm = round(bpm)
    # In a centred 512-sample window, a sharp onset starts contributing about
    # three hops before the attack. Restore the sample-time position of the beat.
    onset = (grid(bpm)[1] + 3 * HOP / RATE) % (60 / bpm)
    return bpm, round(float(onset), 4)


def tonal_key(samples):
    size = 4096
    pitch_classes = np.zeros(12)
    for spectrum in spectra(samples, size, size // 2):
        # Tonal peaks dominate neighbouring bins. Quadratic interpolation keeps the
        # low-frequency note assignment from depending on FFT bin boundaries.
        rows, bins = np.nonzero((spectrum[:, 1:-1] > spectrum[:, :-2]) &
                                (spectrum[:, 1:-1] >= spectrum[:, 2:]))
        bins += 1
        valid = (bins >= 18) & (bins < 950)
        rows, bins = rows[valid], bins[valid]
        magnitude = spectrum[rows, bins]
        a = np.log(np.maximum(spectrum[rows, bins - 1], 1e-9))
        b = np.log(np.maximum(magnitude, 1e-9))
        c = np.log(np.maximum(spectrum[rows, bins + 1], 1e-9))
        delta = 0.5 * (a - c) / np.minimum(a - 2 * b + c, -1e-6)
        hz = (bins + delta.clip(-0.5, 0.5)) * RATE / size
        notes = 69 + 12 * np.log2(hz / 440)
        rounded = np.rint(notes).astype(int)
        alignment = np.cos(np.pi * (notes - rounded)) ** 2
        weights = magnitude ** 1.1 * alignment
        chroma = np.bincount(rows * 12 + rounded % 12, weights=weights,
                             minlength=len(spectrum) * 12).reshape(-1, 12)
        totals = chroma.sum(axis=1)
        usable = totals > 1
        pitch_classes += (chroma[usable] / totals[usable, None]).sum(axis=0)

    if np.std(pitch_classes) < 1e-8:
        return None
    profiles = [
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    ]
    notes = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
    scores = sorted(((np.corrcoef(pitch_classes, np.roll(profile, root))[0, 1],
                      notes[root] + suffix)
                     for profile, suffix in zip(profiles, ["", "m"])
                     for root in range(12)), reverse=True)
    if scores[0][0] < 0.5 or scores[0][0] - scores[1][0] < 0.025:
        return None
    return scores[0][1]


def analyze(path):
    audio = read_audio(path)
    flux, bass = transients(audio)
    bpm, offset = beat_grid(flux)
    bass_wave = np.interp((np.arange(WAVE_BINS) + 0.5) * len(audio) / WAVE_BINS / HOP,
                          np.arange(len(bass)), bass)
    return {
        "duration": round(len(audio) / RATE, 4), "bpm": bpm,
        "offset": offset, "key": tonal_key(audio),
        "peaks": packed(wave_envelope(audio)), "bass": packed(bass_wave),
    }


def previous_analysis(manifest):
    if not manifest.exists():
        return {}
    match = re.search(r"^  const tracks = (\{.*\});$", manifest.read_text(encoding="utf-8"), re.MULTILINE)
    return json.loads(match[1]) if match else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--playlist", type=Path, help="Candidate playlist JSON (default: ROOT/playlist.json)")
    parser.add_argument("--manifest-dir", type=Path, help="Directory containing the staged JS manifest (default: ROOT)")
    parser.add_argument("--jobs", type=int, default=min(2, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    root = args.root.resolve()
    playlist = args.playlist or root / "playlist.json"
    manifest = (args.manifest_dir or root).resolve() / "dj-analysis.js"
    tracks = json.loads(playlist.read_text(encoding="utf-8"))
    previous = previous_analysis(manifest)

    def process(track):
        path = root / track["audio"]
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        old = previous.get(track["audio"], {})
        if old.get("sourceHash") == digest and old.get("analysisVersion") == ANALYSIS_VERSION:
            return track["audio"], old
        result = analyze(path)
        result.update(sourceHash=digest, analysisVersion=ANALYSIS_VERSION)
        print(f'{track["title"]}: {result["bpm"]} BPM, {result["key"]}, '
              f'offset {result["offset"]:.3f}s', flush=True)
        return track["audio"], result

    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        results = dict(executor.map(process, tracks))
    data = json.dumps(results, ensure_ascii=False, separators=(",", ":"))
    script = (
        "// Generated from playlist audio by tools/analyze-dj.py.\n"
        "(() => {\n"
        f"  const tracks = {data};\n"
        "  for (const track of Object.values(tracks)) {\n"
        "    for (const field of ['peaks', 'bass']) {\n"
        "      track[field] = Array.from(atob(track[field]), value => value.charCodeAt(0) / 255);\n"
        "    }\n"
        "  }\n"
        "  window.DJ_ANALYSIS = tracks;\n"
        "})();\n"
    )
    manifest.parent.mkdir(parents=True, exist_ok=True)
    if not manifest.exists() or manifest.read_text(encoding="utf-8") != script:
        with tempfile.NamedTemporaryFile("w", dir=manifest.parent, suffix=".tmp", encoding="utf-8", delete=False) as file:
            file.write(script)
        os.replace(file.name, manifest)


if __name__ == "__main__":
    main()
