"""Generate the shared playlist manifest for the static site and Android shell."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable

AUDIO_EXTENSIONS = {".flac", ".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac"}
LEGACY_MEDIA_DIRECTORIES = {"wave-phonk"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DASH_SPLIT = re.compile(r"\s*-\s*", re.UNICODE)


def _relative_url(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _find_asset_directory(assets_root: Path, media_directory_name: str) -> Path | None:
    if not assets_root.exists():
        return None

    wanted = media_directory_name.casefold()
    candidates = [candidate for candidate in assets_root.iterdir() if candidate.is_dir()]
    for candidate in candidates:
        if candidate.name == media_directory_name:
            return candidate
    for candidate in candidates:
        if candidate.name.casefold() == wanted:
            return candidate
    return None


def _choose_cover(audio_path: Path, assets_root: Path) -> Path | None:
    asset_directory = _find_asset_directory(assets_root, audio_path.parent.name)
    if asset_directory is None:
        return None

    images = sorted(
        (candidate for candidate in asset_directory.iterdir() if candidate.is_file() and candidate.suffix.casefold() in IMAGE_EXTENSIONS),
        key=lambda candidate: candidate.name.casefold(),
    )
    if not images:
        return None

    audio_stem = audio_path.stem.casefold()
    for image in images:
        if image.stem.casefold() == audio_stem:
            return image

    for image in images:
        if image.stem.casefold() in {"cover", "artwork", "art", "folder"}:
            return image

    return images[0]


def _parse_filename(audio_path: Path) -> tuple[str, str]:
    parts = DASH_SPLIT.split(audio_path.stem, maxsplit=1)
    if len(parts) == 2:
        artist, title = (part.strip() for part in parts)
        if artist and title:
            return artist, title
    return "", audio_path.stem.strip()


def _iter_audio(media_root: Path) -> Iterable[Path]:
    if not media_root.exists():
        return []
    return sorted(
        (
            candidate
            for candidate in media_root.rglob("*")
            if candidate.is_file()
            and candidate.suffix.casefold() in AUDIO_EXTENSIONS
            and candidate.parent.name.casefold() not in LEGACY_MEDIA_DIRECTORIES
        ),
        key=lambda candidate: candidate.as_posix().casefold(),
    )


def build_playlist(media_root: Path, assets_root: Path, public_root: Path) -> list[dict[str, str]]:
    """Return deterministic metadata for every supported audio file."""
    playlist: list[dict[str, str]] = []
    for audio_path in _iter_audio(media_root):
        artist, title = _parse_filename(audio_path)
        cover_path = _choose_cover(audio_path, assets_root)
        audio_url = _relative_url(audio_path, public_root)
        item = {
            "id": audio_url,
            "artist": artist,
            "title": title,
            "audio": audio_url,
        }
        if cover_path is not None:
            item["cover"] = _relative_url(cover_path, public_root)
        playlist.append(item)
    return playlist


def write_playlist(root: Path) -> Path:
    media_root = root / "media"
    assets_root = root / "assets"
    output_path = root / "playlist.json"
    script_path = root / "playlist-data.js"
    playlist = build_playlist(media_root, assets_root, root)
    serialized = json.dumps(playlist, ensure_ascii=False, indent=2)
    output_path.write_text(
        serialized + "\n",
        encoding="utf-8",
    )
    script_path.write_text(
        f"window.INTEONMTECA_PLAYLIST = {serialized};\n",
        encoding="utf-8",
    )
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    output_path = write_playlist(args.root.resolve())
    print(f"Generated {output_path} with {len(json.loads(output_path.read_text(encoding='utf-8')))} track(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
