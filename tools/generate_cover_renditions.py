"""Generate tiny content-addressed artwork without changing any original.

Run before generate_playlist.py after importing/changing artwork. Pillow is a
build-only dependency already used by import_desktop_covers.py. Old hashed
files are deliberately retained so a cached manifest remains valid.
"""
from __future__ import annotations
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
from PIL import Image, ImageOps
from generate_playlist import build_playlist, write_playlist

WIDTHS = (16, 24, 32, 48, 64)


def generate(root: Path) -> dict:
    playlist = build_playlist(root / 'media', root / 'assets', root)
    originals = sorted({url for track in playlist
                        for url in track.get('covers', [track.get('cover')]) if url})
    directory = root / 'assets' / 'track-covers' / 'renditions'
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for original in originals:
        candidates = []
        with Image.open(root / original) as source:
            source = ImageOps.exif_transpose(source).convert('RGB')
            for width in WIDTHS:
                image = source.copy()
                image.thumbnail((width, width), Image.Resampling.LANCZOS)
                buffer = BytesIO()
                image.save(buffer, 'WEBP', quality=78, method=6, exact=True)
                data = buffer.getvalue()
                digest = hashlib.sha256(data).hexdigest()[:16]
                target = directory / f'{digest}-{width}.webp'
                if not target.exists() or target.read_bytes() != data:
                    target.write_bytes(data)
                candidates.append({'width': width, 'url': target.relative_to(root).as_posix()})
        manifest[original] = candidates
    (directory.parent / 'renditions.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_playlist(root)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    result = generate(args.root.resolve())
    print(f'Generated renditions for {len(result)} original covers; refreshed both playlist manifests')
