"""Prepare the courtyard's small, tileable colour and packed height/roughness maps."""
import hashlib
import io
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import requests
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'yard/assets/surfaces'
SCANS = {
    'asphalt': ('asphalt_04', [102, 100, 93]),
    'concrete': ('concrete_floor_02', [163, 156, 140]),
    'soil': ('brown_mud_dry', [114, 104, 83]),
    'plaster': ('plastered_wall_02', [223, 223, 219]),
    'bark': ('bark_brown_02', [105, 94, 75]),
    'paint': ('rusty_painted_metal', [235, 235, 232]),
}


def source(session, record, cache):
    filename = cache / record['md5']
    if not filename.exists():
        response = session.get(record['url'], timeout=45)
        response.raise_for_status()
        if hashlib.md5(response.content).hexdigest() != record['md5']:
            raise ValueError(f"Source checksum mismatch for {record['url']}")
        filename.write_bytes(response.content)
    return Image.open(io.BytesIO(filename.read_bytes()))


def stretch(values):
    lo, hi = np.percentile(values, [1, 99])
    return np.clip((values - lo) / max(1, hi - lo), 0, 1)


def save(name, colour, height, roughness):
    def write(suffix, channels, quality):
        image = Image.fromarray(np.clip(channels, 0, 255).astype(np.uint8))
        limit = 512 if suffix == 'surface' else 768 if name == 'brick' else 640
        image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        image.save(OUT / f'{name}-{suffix}.webp', quality=quality, method=6)
    write('color', colour, 84)
    # Three.js bumpMap reads red and roughnessMap reads green. Copying green
    # into blue also keeps the two channels clean after chroma compression.
    write('surface', np.stack([height, roughness, roughness], axis=-1), 88)


def masonry(grain):
    # Eight courses of locally observed pale rectangular bricks. A periodic
    # running bond preserves the surveyed 2.08 × 0.60 m texture scale.
    h, w = 256, 768
    y, x = np.indices((h, w))
    y = y + 0.65 * np.sin(2 * np.pi * x * 4 / w)
    row = (y // 32).astype(int)
    x = x + 48 * (row % 2) + 0.7 * np.sin(2 * np.pi * y * 2 / h)
    col = (x // 96).astype(int)
    gap = np.minimum(np.minimum(x % 96, 96 - x % 96),
                     np.minimum(y % 32, 32 - y % 32))
    stone = np.clip((gap - 1.0) / 2.4, 0, 1)
    aggregate = grain[:h, :w] - grain.mean()
    variation = np.random.default_rng(14).normal(0, 4.6, (8, 8))[row % 8, col % 8]
    mortar = np.array([156, 151, 139])
    faces = np.array([200, 195, 181]) + (variation + aggregate * 0.95)[:, :, None]
    color = mortar + (faces - mortar) * stone[:, :, None]
    color += (aggregate * .38)[:, :, None]
    save('brick', color, 46 + stone * 144 + aggregate * 1.4, 219 + stone * 17 + aggregate * .3)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session, TemporaryDirectory() as tmp:
        session.headers['User-Agent'] = 'inteonmteca offline courtyard material baker/1.0'
        for name, (asset, tint) in SCANS.items():
            response = session.get(f'https://api.polyhaven.com/files/{asset}', timeout=25)
            response.raise_for_status()
            files = response.json()
            def pixels(channel, mode):
                im = source(session, files[channel]['1k']['jpg'], Path(tmp))
                return np.asarray(im.convert(mode).resize((768, 768), Image.Resampling.LANCZOS), dtype=np.float32)
            photo = pixels('Diffuse', 'RGB')
            height = pixels('Displacement', 'L')
            rough = pixels('Rough', 'L')
            lum = photo @ np.array([.2126, .7152, .0722])
            mean = np.mean(photo, axis=(0, 1))
            colour = np.clip((photo - mean) * (.8 if name == 'concrete' else 1) + tint, 0, 255)
            if name == 'paint':
                colour = np.asarray(tint) + (lum - lum.mean())[:, :, None] * .50
            save(name, colour, 30 + 196 * stretch(height), 172 + 78 * stretch(rough))
            if name == 'concrete':
                masonry(lum)


if __name__ == '__main__':
    main()
