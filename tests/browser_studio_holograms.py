"""Check the studio's glyphs against the actual text, touch targets and reduced-motion setting."""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright
from studio_window import open_full_studio


def verify(browser, url, mobile, screenshots):
    width, height = (390, 844) if mobile else (1440, 900)
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile,
                            reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url, wait_until="domcontentloaded")
    open_full_studio(page)
    title = page.locator('#deck-a .dd-track-text h2')
    page.wait_for_selector('#deck-a [aria-current=true]')
    page.evaluate("document.fonts.ready")
    original = title.text_content()
    position = title.bounding_box()
    assert original and position
    assert page.locator(".studio-projection").count() == 1
    assert page.locator(".studio-projection").is_hidden()
    assert page.locator('#studio .is-wave-noisy').count() == 0
    if screenshots:
        page.screenshot(path=screenshots / f"studio-{width}-still.png")
    page.emulate_media(reduced_motion="no-preference")
    title.locator('.text-wave-char').first.wait_for(state="attached")
    page.wait_for_function("document.querySelector('#studio .is-wave-noisy') !== null")
    page.wait_for_function("document.querySelector('.studio-projection')?.dataset.motif === 'crow'")
    assert title.text_content() == original
    assert page.get_by_role("heading", name=original, exact=True).first.is_visible()
    assert title.evaluate("""el => [...el.querySelectorAll('.studio-wave-word')].every(word => {
      const source = word.querySelector('.studio-wave-source').getBoundingClientRect();
      return [...word.querySelectorAll('.text-wave-char')].every(char =>
        Math.abs(char.getBoundingClientRect().top - source.top) < 1.5);
    })""")
    box = title.bounding_box()
    assert all(abs(box[key] - position[key]) < 1.5 for key in box), (position, box)
    assert page.locator('.studio-projection').evaluate("""canvas => {
      const style = getComputedStyle(canvas);
      return style.pointerEvents === 'none' && canvas.getAttribute('aria-hidden') === 'true';
    }""")
    page.wait_for_function("""() => {
      const c = document.querySelector('.studio-projection');
      if (c.hidden) return false;
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let p = 3; p < pixels.length; p += 4) if (pixels[p] > 40) ink++;
      return ink > 260;
    }""")
    if screenshots:
        page.screenshot(path=screenshots / f"studio-{width}-active.png")
        page.locator('.studio-projection').screenshot(path=screenshots / f"studio-{width}-projection.png")
    page.wait_for_function("document.querySelector('.studio-projection').dataset.motif === 'city'", timeout=45_000)
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_function("document.querySelector('.studio-projection').hidden && !document.querySelector('#studio .is-wave-noisy')")
    search = page.locator('#deck-a [type=search]')
    search.fill(original)
    assert search.input_value() == original and page.get_by_role("option", selected=True).first.is_visible()
    assert not errors, errors
    print(f"{width}×{height} exact heading, stable box, playlist input, two motion motifs and still mode verified", flush=True)
    page.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url", default="http://127.0.0.1:8080/", nargs="?")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        for mobile in (False, True):
            verify(browser, args.url, mobile, args.screenshots)
        browser.close()
