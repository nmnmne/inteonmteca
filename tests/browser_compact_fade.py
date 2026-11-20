"""Exercise the compact player's one-minute fade using virtual time and real input."""
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

    assert_level(a, 1)
    press(a)
    advance(15_000)
    assert_level(a, .75)
    point(width / 2, height / 4)
    advance(15_000)
    assert_level(a, .5)

    press(a)
    assert_level(a, 1)
    advance(45_000)
    assert_level(a, .25)
    advance(15_100)
    assert_level(a, 0)

    # Tap exactly where deck B was drawn, allowing the wake surface to intercept it.
    press(b)
    assert_level(b, 1)
    assert a.get_attribute("aria-pressed") == "true"
    assert b.get_attribute("aria-pressed") == "false"
    press(b)
    assert b.get_attribute("aria-pressed") == "true"

    picker = compact.locator("#compact-picker")
    press(compact.locator("#compact-track-select"))
    picker.wait_for()
    advance(61_000)
    assert_level(b, 1)
    assert picker.is_visible()
    page.keyboard.press("Escape")
    picker.wait_for(state="hidden")
    page.clock.run_for(35)  # Dispatch the native popover toggle before advancing the clock.
    advance(15_000)
    assert_level(b, .75)

    press(compact.get_by_role("button", name="Настройки звука"))
    dialog = page.locator("#dialog")
    dialog.wait_for()
    advance(61_000)
    assert_level(b, 1)
    assert dialog.is_visible()
    press(dialog.locator("#dialog-close"))
    dialog.wait_for(state="hidden")

    press(compact.locator("[data-dj-mode=full]"))
    studio = page.locator("#studio")
    studio.wait_for()
    advance(61_000)
    assert_level(studio, 1)
    press(studio.locator("[data-dj-mode=compact]"))
    b.wait_for()
    assert_level(b, 1)
    assert b.get_attribute("aria-pressed") == "true"
    advance(61_000)
    assert_level(b, 0)
    a.focus()
    assert_level(a, 1)
    page.keyboard.press("Enter")
    assert a.get_attribute("aria-pressed") == "true"
    page.close()
    print(f"{width} × {height}: fade, pointer and keyboard wake, open panels and Full mode passed", flush=True)


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    with sync_playwright() as playwright:
        path = os.environ.get("CHROMIUM_PATH")
        with playwright.chromium.launch(executable_path=path, channel=None if path else "msedge") as browser:
            check(browser, url, 1440, 900, False)
            check(browser, url, 390, 844, True)
