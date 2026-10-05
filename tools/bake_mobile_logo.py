"""Bake only the original SVG wordmark into a deterministic fragmented alpha mask.
No UI, fonts, runtime SVG filters or animation are part of the output.
Requires Pillow and Playwright (Edge); run from any working directory.
"""
from pathlib import Path
from io import BytesIO
import random
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1068, 'height': 214}, device_scale_factor=1)
    svg = (root / 'assets/logo-wordmark.svg').read_text(encoding='utf-8')
    page.set_content('<style>html,body{margin:0;background:transparent}svg{width:1068px;height:214px}</style>' + svg)
    original = Image.open(BytesIO(page.screenshot(omit_background=True))).getchannel('A')
    browser.close()
# Slightly thicker strokes and subtle displaced duplicates reproduce the chunky
# silhouette in the reference, while retaining the actual traced letter shapes.
original = original.filter(ImageFilter.MaxFilter(5))
canvas = Image.new('L', (1160, 280))
def layer(image, x, y, opacity):
    alpha = image.point(lambda v: round(v * opacity))
    canvas.paste(Image.new('L', image.size, 255), (x, y), alpha)
layer(original, 45, 33, .30)
layer(original, 51, 36, .20)
rng = random.Random(41)
for y in range(0, 214, 32):
    for x in range(0, 1068, 43):
        tile = original.crop((x, y, min(x + 43, 1068), min(y + 32, 214)))
        dx = rng.choice([-10, -6, -3, 0, 2, 4, 8, 12])
        dy = rng.choice([-6, -2, 0, 0, 2, 5])
        layer(tile, 46 + x + dx, 33 + y + dy, rng.uniform(.22, .68))
image = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
image.putalpha(canvas)
target = root / 'assets/logo-fragmented.png'
image.save(target, optimize=True)
print(f'{target}: {image.width}x{image.height}, {target.stat().st_size} bytes')
