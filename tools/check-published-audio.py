"""Verify that a web-only release can use the already published music masters."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote
from urllib.request import Request, urlopen

from prepare_dj_library import MANIFESTS, asset_paths


def check(path):
    if not path.startswith(("media/", "assets/dj-audio/", "assets/dj-spatial/")) or ".." in path.split("/"):
        raise ValueError(f"Unexpected audio path: {path}")
    request = Request("https://inteonmteca.online/" + quote(path), headers={"Range": "bytes=0-0"})
    try:
        with urlopen(request, timeout=30) as response:
            if response.status != 206 or not response.headers.get("Content-Range", "").startswith("bytes 0-0/"):
                raise ValueError(f"Byte range unavailable: {path}")
    except OSError as error:
        raise RuntimeError(f"Published audio unavailable: {path}") from error


def verify(root):
    tracks = json.loads((root / "playlist.json").read_text(encoding="utf-8"))
    catalog = (root / "playlist-data.js").read_text(encoding="utf-8").strip()
    if not tracks or json.loads(catalog.removeprefix("window.INTEONMTECA_PLAYLIST = ").removesuffix(";")) != tracks:
        raise ValueError("Playlist files disagree or are empty")
    files = set(asset_paths(root)) | {track["audio"] for track in tracks}
    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(check, sorted(files)))
    print(f"Verified {len(files)} published audio files for {len(tracks)} tracks.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Use the production catalog in a fresh GitHub runner checkout.")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.live:
        if os.environ.get("GITHUB_ACTIONS") != "true" or Path(os.environ["GITHUB_WORKSPACE"]).resolve() != root:
            raise SystemExit("The live catalog is staged only in the runner's checkout.")
        with TemporaryDirectory() as directory:
            stage = Path(directory)
            for name in MANIFESTS:
                with urlopen("https://inteonmteca.online/" + name, timeout=30) as response:
                    (stage / name).write_bytes(response.read())
            verify(stage)
            for name in MANIFESTS:
                (root / name).write_bytes((stage / name).read_bytes())
    else:
        verify(root)
