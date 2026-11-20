"""Check the compact player's two idle stages with a virtual clock and real input."""
import os
import sys

from playwright.sync_api import sync_playwright


def opacity(control):
    return control.evaluate("""el => {
        let level = 1;
        for (; el; el = el.parentElement) level *= Number(getComputedStyle(el).opacity);
        return level;
    }""")


def check(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch, has_touch=touch,
                            reduced_motion="reduce")
    # Keep native theme transitions clear of the hit targets while skipping many minutes.
    page.add_init_script("""{
        const d = new Date();
        localStorage.setItem('inteonmteca-theme-duration', '604800000');
        localStorage.setItem('inteonmteca-theme-duration-day', `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`);
    }""")
    page.clock.install()
    page.goto(url, wait_until="domcontentloaded")
    compact = page.locator("#yard-dj-compact")
    a = compact.get_by_role("button", name="Дека A", exact=True)
    b = compact.get_by_role("button", name="Дека B", exact=True)
    a.wait_for()

    def advance(milliseconds):
        page.clock.fast_forward(milliseconds)
        page.clock.run_for(35)

    def assert_level(control, expected):
        actual = opacity(control)
        assert abs(actual - expected) < .03, f"{width}px: expected opacity {expected}, got {actual}"

    def point(x, y):
        if touch:
            page.touchscreen.tap(x, y)
        else:
            page.mouse.click(x, y)

    def press(control):
        box = control.bounding_box()
        point(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    recall = compact.get_by_role("button", name="Развернуть плеер")
    assert_level(a, 1)
    press(a)
    b_box = b.bounding_box()
    advance(500)
    assert a.is_visible() and not recall.is_visible()
    point(width / 2, height / 4)
    assert recall.is_visible() and not a.is_visible()
    assert_level(recall, 1)
    assert recall.bounding_box()["width"] < 245
    assert recall.locator("span").inner_text().strip()
    mini_fullscreen = compact.locator(".compact-mini-fullscreen")
    assert mini_fullscreen.bounding_box()["x"] >= recall.bounding_box()["x"] + recall.bounding_box()["width"] - 1
    if page.evaluate("document.fullscreenEnabled"):
        press(mini_fullscreen)
        page.wait_for_function("!!document.fullscreenElement")
        assert recall.is_visible() and not a.is_visible()
        press(mini_fullscreen)
        page.wait_for_function("!document.fullscreenElement")
    advance(16_000)
    point(width / 2, height / 4)
    advance(3_000)
    assert_level(recall, 1)
    advance(1_100)
    assert_level(recall, 0)
    press(recall)
    assert a.is_visible() and a.get_attribute("aria-pressed") == "true"
    advance(10_100)
    assert_level(recall, 1)
    advance(19_000)
    assert_level(recall, 1)
    advance(1_200)
    assert_level(recall, 0)

    # The first tap in the original dock wakes it without activating deck B.
    point(b_box["x"] + b_box["width"] / 2, b_box["y"] + b_box["height"] / 2)
    assert b.is_visible()
    assert a.get_attribute("aria-pressed") == "true"
    assert b.get_attribute("aria-pressed") == "false"
    press(b)
    assert b.get_attribute("aria-pressed") == "true"

    picker = compact.locator("#compact-picker")
    press(compact.locator("#compact-track-select"))
    picker.wait_for()
    point(width / 2, 18)
    picker.wait_for(state="hidden")
    assert b.is_visible() and not recall.is_visible()
    press(compact.locator("#compact-track-select"))
    picker.wait_for()
    advance(31_000)
    assert_level(b, 1)
    assert picker.is_visible()
    picker.evaluate("""el => el.addEventListener('toggle', () => { window.qaPickerClosed = true; }, {once:true})""")
    page.keyboard.press("Escape")
    picker.wait_for(state="hidden")
    page.wait_for_function("window.qaPickerClosed === true")
    advance(10_100)
    assert recall.is_visible() and not b.is_visible()
    press(recall)

    press(compact.get_by_role("button", name="Настройки звука"))
    dialog = page.locator("#dialog")
    dialog.wait_for()
    advance(31_000)
    assert_level(b, 1)
    assert dialog.is_visible()
    press(dialog.locator("#dialog-close"))
    dialog.wait_for(state="hidden")

    press(compact.locator("[data-dj-mode=full]"))
    studio = page.locator("#studio")
    studio.wait_for()
    advance(31_000)
    assert_level(studio, 1)
    press(studio.locator("[data-dj-mode=compact]"))
    b.wait_for()
    assert_level(b, 1)
    assert b.get_attribute("aria-pressed") == "true"
    advance(31_000)
    assert_level(recall, 0)
    recall.focus()
    assert compact.locator("#compact-track-select").evaluate("el => document.activeElement === el")
    a.focus()
    assert_level(a, 1)
    page.keyboard.press("Enter")
    assert a.get_attribute("aria-pressed") == "true"
    page.close()
    print(f"{width} × {height}: 10s ultra, 30s invisible, pointer and keyboard wake, open panels and Full mode passed", flush=True)


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    with sync_playwright() as playwright:
        path = os.environ.get("CHROMIUM_PATH")
        with playwright.chromium.launch(executable_path=path, channel=None if path else "msedge") as browser:
            check(browser, url, 1440, 900, False)
            check(browser, url, 390, 844, True)
