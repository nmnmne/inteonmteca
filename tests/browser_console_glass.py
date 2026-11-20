"""Compare the courtyard in open console space and through each control material."""
import io
import sys

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright
from studio_window import open_full_studio


def captures(page):
    shots = []
    for shade in (24, 224):
        page.locator('[data-yard-layer]').evaluate(
            "(layer, shade) => layer.style.setProperty('background', 'rgb(' + [shade, shade, shade] + ')', 'important')",
            shade)
        shots.append(Image.open(io.BytesIO(page.screenshot(animations="disabled"))).convert("RGB"))
    return shots


def measure_view(page, surfaces):
    # Test actual gaps in the chrome, deck hardware and mixer, clear of adjacent text and rims.
    points = page.locator('#studio').evaluate("""studio => {
        const empty = '.room-console, .room-console-top, .workspace, #performance, .deck-bank, .dj-deck, .dd-head, ' +
          '.dd-hardware, .dd-pitch, .dd-transport, .dd-wheel-column, .dd-wheel-settings, .dd-pads, ' +
          '.mixer-panel, .mixer-bed, .channel-strip, .dial-bank, .cross-section';
        const rect = studio.getBoundingClientRect(), points = [];
        for (let y = Math.ceil(rect.top) + 4; y < rect.bottom - 4; y += 12)
          for (let x = Math.ceil(rect.left) + 4; x < rect.right - 4; x += 12)
            if ([[0,0],[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy]) => document.elementFromPoint(x+dx,y+dy)?.matches(empty)))
              points.push([x,y]);
        return points;
    }""")
    assert len(points) > 20, len(points)
    controls = captures(page)
    page.locator('#studio').evaluate("el => el.style.opacity = 0")
    bare = captures(page)
    page.locator('#studio').evaluate("el => el.style.removeProperty('opacity')")
    matches = []
    for shot, reference in zip(controls, bare):
        diff = ImageChops.difference(shot, reference)
        identical = sum(max(diff.getpixel(tuple(p))) <= 1 for p in points) / len(points)
        assert identical >= .985, ('open space changed', identical, len(points))
        matches.append(identical)

    # Compare the same pixels against a bare-yard measurement. The central part of each
    # silhouette excludes its intentionally transparent outer corners and neighbouring controls.
    transmitted = ImageChops.difference(*controls).convert('L')
    incident = ImageChops.difference(*bare).convert('L')
    for selector, kind in surfaces:
        box = page.locator(selector).first.bounding_box()
        assert box, selector
        x, y, w, h = (box[k] for k in ('x', 'y', 'width', 'height'))
        box = tuple(round(v) for v in (x + w * .17, y + h * .20, x + w * .83, y + h * .80))
        assert 0 <= box[0] < box[2] <= transmitted.width and 0 <= box[1] < box[3] <= transmitted.height, (selector, box)
        light = ImageStat.Stat(incident.crop(box)).median[0]
        assert light > 150, ('calibration', selector, light)
        ratio = ImageStat.Stat(transmitted.crop(box)).median[0] / light
        low, high = {'screen': (.035, .38), 'jog': (.10, .55), 'button': (.025, .40), 'knob': (.01, .26)}[kind]
        assert low < ratio < high, (selector, round(ratio, 3))
        print(f"{page.viewport_size['width']} {selector} transmits {ratio:.1%}", flush=True)
    print(f"   {min(matches):.2%} of {len(points)} gap samples match the bare yard", flush=True)


def measure(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, has_touch=touch,
                            is_mobile=touch, reduced_motion="reduce")
    page.goto(url, wait_until="domcontentloaded")
    open_full_studio(page)
    page.wait_for_selector('#deck-a [role="option"][aria-current="true"]')
    page.wait_for_function("document.fonts.status === 'loaded'")
    page.add_style_tag(content="""
      [data-yard-layer] > *, .room-resident, .resident-speech { visibility: hidden !important; }
    """)
    knobs = [('.tone-a .dial-face', 'knob'), ('.tone-b .dial-face', 'knob')]
    decks = []
    for side in ('a', 'b'):
        deck = f'#deck-{side} '
        decks.append([(deck + '.dd-screen', 'screen'), (deck + '.dd-lock', 'button'), (deck + '.dd-jog', 'jog')])
    if touch:
        tabs = page.locator('.controller-tabs')
        for side, (screen, button, jog) in zip(('a', 'b'), decks):
            tabs.locator(f'[data-panel={side}]').click()
            page.locator(screen[0]).scroll_into_view_if_needed()
            measure_view(page, [screen, button])
            page.locator(jog[0]).scroll_into_view_if_needed()
            measure_view(page, [jog])
        tabs.locator('[data-panel=mixer]').click()
        page.locator('.dial-face').first.scroll_into_view_if_needed()
        measure_view(page, knobs)
    else:
        measure_view(page, decks[0] + decks[1] + knobs)
    page.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/'
        measure(browser, url, 1440, 900, False)
        measure(browser, url, 390, 844, True)
        browser.close()
