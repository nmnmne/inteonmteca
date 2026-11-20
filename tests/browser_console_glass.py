"""Measure how much of the courtyard reaches the assembled DJ console in a real browser."""
import io
import sys

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright


def visible_bounds(page, selector):
    element = page.locator(selector)
    element.wait_for(state="visible")
    bounds = element.bounding_box()
    width, height = page.viewport_size['width'], page.viewport_size['height']
    box = (max(0, round(bounds["x"])), max(0, round(bounds["y"])),
           min(width, round(bounds["x"] + bounds["width"])),
           min(height, round(bounds["y"] + bounds["height"])))
    assert box[0] < box[2] and box[1] < box[3], (selector, box)
    return box


def measure(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, has_touch=touch,
                            is_mobile=touch, reduced_motion="reduce")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector('#deck-a [role="option"][aria-current="true"]')
    page.wait_for_function("document.fonts.status === 'loaded'")
    regions = {name: visible_bounds(page, '#deck-a ' + selector) for name, selector in
               (('screen', '.dd-screen'), ('jog', '.dd-jog'), ('body', '.dd-hardware'))}
    if page.locator('#mixer').is_visible():
        regions['mixer'] = visible_bounds(page, '#mixer')
    # Identical controls and lighting in both captures. Vary only the light
    # behind the surface. A printed yard image or a mirrored copy cannot pass.
    page.add_style_tag(content="""
        [data-yard-layer] > *, .console-reflection, .room-resident, .resident-speech { visibility: hidden !important; }
        [data-yard-layer]::after { display: none !important; }
    """)
    samples = []
    for shade in (24, 224):
        page.locator('[data-yard-layer]').evaluate(
            "(layer, value) => layer.style.setProperty('background', value, 'important')", f"rgb({shade} {shade} {shade})")
        samples.append(Image.open(io.BytesIO(page.screenshot(animations="disabled"))).convert("RGB"))
    change = ImageChops.difference(*samples).convert("L")
    for name, box in regions.items():
        transmitted = ImageStat.Stat(change.crop(box)).median[0] / 200
        # Allow for readable ink, knobs, meters and screen tint, while ensuring
        # at least half of each large component transmits changing scenery.
        minimum = .13 if name == 'screen' else .30
        assert transmitted > minimum, (width, height, name, round(transmitted, 3))
        print(f"{width}×{height} {name} {transmitted:.0%}", flush=True)
    page.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/'
        measure(browser, url, 1440, 900, False)
        measure(browser, url, 390, 844, True)
        browser.close()
