"""Import reviewed release artwork as small web assets; never modify source files.

Pillow is needed only for this one-time import, not for playlist generation.
Paths in the source list are relative to --desktop.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".psd"}


def import_covers(desktop: Path, root: Path, sources: list[dict]) -> dict:
    registered = {desktop / folder for group in sources for folder in group.get("folders", [])}
    collections = []
    for group in sources:
        paths = {desktop / file for file in group.get("files", [])}
        for folder in group.get("folders", []):
            directory = desktop / folder
            for path in directory.rglob("*"):
                if "Clip" in path.parts or path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                # A nested release has its own set, rather than inheriting its parent's.
                if any(parent in registered and parent != directory for parent in path.parents if parent.is_relative_to(directory)):
                    continue
                paths.add(path)
        artwork = {}
        for path in sorted(paths, key=lambda item: item.as_posix().casefold()):
            if not path.is_file():
                raise FileNotFoundError(path)
            source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            if source_hash not in artwork:
                target = root / "assets" / "track-covers" / group["key"] / f"{source_hash[:16]}.webp"
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists():
                    with Image.open(path) as image:
                        image = ImageOps.exif_transpose(image)
                        image.thumbnail((960, 960), Image.Resampling.LANCZOS)
                        image.convert("RGB").save(target, "WEBP", quality=88, method=6)
                artwork[source_hash] = {"url": target.relative_to(root).as_posix(), "sources": []}
            artwork[source_hash]["sources"].append(path.relative_to(desktop).as_posix())
        if artwork:
            collections.append({
                "title": group["title"],
                "mediaDirectory": group.get("mediaDirectory"),
                "artwork": list(artwork.values()),
            })
    catalog = {"collections": collections}
    (root / "assets" / "track-covers" / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desktop", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    config = json.loads(Path(__file__).with_name("desktop-cover-sources.json").read_text(encoding="utf-8"))
    result = import_covers(args.desktop.resolve(), args.root.resolve(), config)
    for collection in result["collections"]:
        print(f'{collection["title"]}: {len(collection["artwork"])} cover(s)')
