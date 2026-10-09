"""Browser checks for spatial text waves, readable interaction, and headline layout."""
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
OUT = Path(tempfile.mkdtemp(prefix="inteon-text-waves-qa-"))

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("localStorage.setItem('inteonmteca-theme-duration', '604800000')")
    page.clock.install()
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".text-wave-char")
    original = page.locator(".listening-intro h1").text_content()
    titles = page.locator(".track-title").all_text_contents()
    page.wait_for_timeout(3300)
    assert page.locator(".is-wave-noisy").count() > 5
    page.screenshot(path=str(OUT / "desktop-wave.png"))

    # Pointer suppression must work while the rest of the screen is still alive.
    box = page.locator(".listening-intro h1").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    outside_peak = 0
    for _ in range(12):
        page.wait_for_timeout(110)
        sample = page.evaluate("""({x,y}) => {
            let near=0, far=0;
            document.querySelectorAll('.is-wave-noisy').forEach(e => {
                const r=e.getBoundingClientRect();
                if(Math.hypot(r.x+r.width/2-x,r.y+r.height/2-y)<100) near++; else far++;
            });
            return {near,far};
        }""", {"x": x, "y": y})
        assert sample["near"] <= 1, sample
        outside_peak = max(outside_peak, sample["far"])
    assert outside_peak > 5
    assert page.locator(".listening-intro h1").text_content() == original == "Выбери свой звук"
    assert page.locator(".track-title").all_text_contents() == titles
    page.screenshot(path=str(OUT / "desktop-cursor-calm.png"))

    page.clock.fast_forward(18000)
    assert page.locator("html").get_attribute("data-text-wave-mode") == "quiet"
    assert page.locator(".is-wave-noisy").count() < 30
    page.clock.fast_forward(10000)
    assert page.locator("html").get_attribute("data-text-wave-mode") == "surge"
    page.wait_for_timeout(1400)
    page.screenshot(path=str(OUT / "desktop-surge.png"))

    # Real controls and dynamic title changes survive the decorative wrappers.
    page.locator(".track-select").first.click()
    page.wait_for_function("!document.querySelector('#album-player').paused")
    page.wait_for_selector(".logo-storm")
    page.locator("#immersive-play").click()
    page.wait_for_function("document.querySelector('#album-player').paused")
    assert page.locator(".logo-storm").count() == 0
    page.locator("#auth-hint").click()
    page.locator("#auth-email").fill("wave-check@example.com")
    assert page.locator("#auth-email").input_value() == "wave-check@example.com"
    page.locator("#auth-close").click()
    page.locator(".track-select").first.focus()
    page.wait_for_timeout(200)
    assert page.locator(".track-select").first.locator(".is-wave-noisy").count() == 0

    # No overflow or heading/logo overlap at narrow, short, and tablet sizes.
    layouts = []
    for width, height in [(1440, 900), (900, 600), (801, 600), (390, 844), (320, 568), (844, 390), (768, 1024)]:
        page.set_viewport_size({"width": width, "height": height})
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(750)
        geometry = page.evaluate("""() => {
            const h=document.querySelector('h1'), r=h.getBoundingClientRect();
            const l=document.querySelector('#logo-wrap').getBoundingClientRect();
            const c=document.querySelector('.release-content').getBoundingClientRect();
            return {overflow:document.documentElement.scrollWidth>innerWidth,
                headingBottom:r.bottom, logoTop:l.top, logoBottom:l.bottom,
                catalogTop:c.top, oneLine:r.height<parseFloat(getComputedStyle(h).fontSize)*1.3,
                navWidth:document.querySelector('#street-link').getBoundingClientRect().width};
        }""")
        assert not geometry["overflow"], (width, height, geometry)
        assert geometry["oneLine"], (width, height, geometry)
        assert geometry["headingBottom"] < geometry["logoTop"], (width, height, geometry)
        assert geometry["navWidth"] < 160, (width, height, geometry)
        if width <= 800 and height > 540:
            assert geometry["logoBottom"] < geometry["catalogTop"], geometry
        layouts.append({"width": width, "height": height, **geometry})
        page.screenshot(path=str(OUT / f"layout-{width}x{height}.png"))

    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(200)
    assert page.locator(".is-wave-noisy").count() == 0
    assert page.locator(".listening-intro h1").text_content() == original
    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_timeout(2400)
    assert page.locator(".is-wave-noisy").count() > 0
    phone = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    mobile = phone.new_page()
    mobile.on("pageerror", lambda error: errors.append(str(error)))
    mobile.goto(URL, wait_until="domcontentloaded")
    mobile.wait_for_timeout(2800)
    assert mobile.evaluate("matchMedia('(pointer: coarse)').matches")
    assert mobile.locator(".is-wave-noisy").count() > 0
    mobile.screenshot(path=str(OUT / "phone-wave.png"))
    # The heading is decorative (pointer-events:none); touch its screen position
    # so the real window-level pointer handler receives the same event as a user.
    heading = mobile.locator(".listening-intro h1").bounding_box()
    mobile.touchscreen.tap(heading["x"] + heading["width"] / 2, heading["y"] + heading["height"] / 2)
    mobile.wait_for_timeout(200)
    assert mobile.locator(".listening-intro h1 .is-wave-noisy").count() <= 1
    mobile.screenshot(path=str(OUT / "phone-touch-calm.png"))
    phone.close()
    assert not errors, errors
    report = {"checks": "passed", "layouts": layouts, "page_errors": errors, "screenshots": str(OUT)}
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    browser.close()
