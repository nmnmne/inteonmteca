"""Prepare and publish the DJ catalog, or watch for stable changes to its media."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager

if __package__:
    from .generate_playlist import build_playlist
else:
    from generate_playlist import build_playlist


TOOLS = Path(__file__).resolve().parent
PROCESSORS = ("process-dj-audio.py", "render-dj-spatial.py", "analyze-dj.py")
MANIFESTS = ("dj-loudness.js", "dj-spatial-tracks.js", "dj-analysis.js", "playlist-data.js", "playlist.json")


class LibraryBusy(Exception):
    """Another preview or build process owns this catalog."""


class InputsChanged(Exception):
    """The source changed while the build was in progress."""


@contextmanager
def build_lock(data):
    # OS-backed locks also release after a crashed worker. Keep the shared inode.
    data.mkdir(parents=True, exist_ok=True)
    with (data / "dj-library.lock").open("a+b") as stream:
        stream.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, PermissionError) as error:
            raise LibraryBusy from error
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def stamp(path):
    info = path.stat()
    return [info.st_size, info.st_mtime_ns]


def snapshot(root):
    tracks = build_playlist(root / "media", root / "assets", root)
    media = {entry["audio"]: stamp(root / entry["audio"]) for entry in tracks}
    recipes = {name: stamp(TOOLS / name) for name in (*PROCESSORS, "generate_playlist.py", Path(__file__).name)}
    recipes["spatialPreset"] = stamp(root / "assets" / "dj-spatial" / "preset.json")
    return tracks, {"media": media, "recipes": recipes, "catalogVersion": 2}


def read_state(root):
    try:
        data = json.loads((root / "server/data/dj-library.json").read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def current(root, inputs, state):
    if inputs != state.get("inputs") or not state.get("outputs"):
        return False
    try:
        return all(stamp(root / name) == expected for name, expected in state["outputs"].items())
    except FileNotFoundError:
        return False


def asset_paths(stage):
    paths = set()
    for name, prefix, keys in (("dj-loudness.js", "window.DJ_LOUDNESS = ", ("src", "scratchSrc")),
                               ("dj-spatial-tracks.js", "window.DJ_SPATIAL_TRACKS = ", ("spatialSrc",))):
        source = (stage / name).read_text(encoding="utf-8").strip()
        records = json.loads(source.removeprefix(prefix).removesuffix(";"))
        paths.update(record[key] for record in records.values() for key in keys)
    return sorted(paths)


def prepare(root, stop=None, expected=None):
    """Return after every required file has been verified and the catalog is public."""
    data = root / "server/data"
    with build_lock(data):
        tracks, inputs = snapshot(root)
        if expected is not None and inputs != expected:
            raise InputsChanged
        if current(root, inputs, read_state(root)):
            return
        with tempfile.TemporaryDirectory(dir=data, prefix=".dj-stage-") as folder:
            stage = Path(folder)
            for name in MANIFESTS[:3]:
                if (root / name).is_file():
                    shutil.copy2(root / name, stage / name)
            serialized = json.dumps(tracks, ensure_ascii=False, indent=2)
            (stage / "playlist.json").write_text(serialized + "\n", encoding="utf-8")
            (stage / "playlist-data.js").write_text("window.INTEONMTECA_PLAYLIST = " + serialized + ";\n", encoding="utf-8")
            for name in PROCESSORS:
                if stop and stop.is_set():
                    return
                subprocess.run([sys.executable, TOOLS / name, "--root", root, "--manifest-dir", stage,
                                "--playlist", stage / "playlist.json"], check=True,
                               env={**os.environ, "PYTHONUTF8": "1"})
            if (stop and stop.is_set()) or inputs != snapshot(root)[1]:
                raise InputsChanged
            paths = asset_paths(stage)
            outputs = {name: stamp(root / name) for name in paths}
            # Immutable audio has already been installed. Publish the catalogs last
            # so a reader cannot select a new song before all its assets exist.
            for name in MANIFESTS:
                ready = stage / name
                published = root / name
                if not published.exists() or published.read_bytes() != ready.read_bytes():
                    os.replace(ready, published)
                outputs[name] = stamp(published)
            marker = stage / "state.json"
            marker.write_text(json.dumps({"inputs": inputs, "outputs": outputs}), encoding="utf-8")
            os.replace(marker, data / "dj-library.json")
        print(f"DJ catalog ready: {len(tracks)} tracks.", flush=True)


@contextmanager
def watch_library(root, poll=3.0, settle=4.0, retry=45.0):
    stop = threading.Event()

    def worker():
        last_inputs = None
        due = 0
        while not stop.is_set():
            try:
                _, inputs = snapshot(root)
                now = time.monotonic()
                if last_inputs != inputs:
                    last_inputs = inputs
                    due = now + settle
                elif now >= due and not current(root, inputs, read_state(root)):
                    try:
                        prepare(root, stop, expected=inputs)
                    except (LibraryBusy, InputsChanged):
                        due = now + poll
            except Exception as error:
                print(f"DJ library refresh will retry: {error}", file=sys.stderr, flush=True)
                due = time.monotonic() + retry
            stop.wait(poll)

    thread = threading.Thread(target=worker, name="DJ library refresh", daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=TOOLS.parent)
    args = parser.parse_args()
    root = args.root.resolve()
    while True:
        try:
            prepare(root)
            break
        except (LibraryBusy, InputsChanged):
            time.sleep(2)
