"""Follow the resident's real studio walks and check clearance around the controls."""
import math
import sys
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def position(resident):
    box = resident.bounding_box()
    assert box, "The resident must be visible"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


# Sample the animation the site actually started. Seeking its timeline lets the
# test inspect long, multi-segment walks without waiting minutes for each lap.
SAMPLE_WALK = """async resident => {
    const motion = resident.getAnimations().find(a => a.effect.getKeyframes().some(k => k.transform));
    if (!motion) return null;
    await motion.ready;
    const frames = motion.effect.getKeyframes().map(k => new DOMMatrix(k.transform));
    const length = frames.slice(1).reduce((sum, p, i) =>
        sum + Math.hypot(p.e - frames[i].e, p.f - frames[i].f), 0);
    const box = el => el.getBoundingClientRect();
    const overlaps = (a, b) => a.right > b.left + 1 && b.right > a.left + 1
        && a.bottom > b.top + 1 && b.bottom > a.top + 1;
    const hazards = [...document.querySelectorAll(
        '.reactive-logo, .listening-intro h1, .room-toolbar button, .console-nav a, ' +
        '#studio button, #studio select, #studio input, #studio .dd-jog, #studio .dd-screen, #studio .dial-face'
    )].filter(el => el.checkVisibility({visibilityProperty:true}) && el.offsetWidth && el.offsetHeight)
      .map(el => [el.id || el.className || el.tagName, box(el)]);
    const centers = ['.mixer-side-passage', '.mixer-cross-passage', '.room-presence'].map(s => {
        const r = box(document.querySelector(s));
        return {name:s, x:r.left + r.width / 2, y:r.top + r.height / 2};
    });
    const samples = Math.max(2, Math.ceil(length / 3));
    const body = resident.querySelector('.resident-body');
    let hit = null, arrival = null;
    for (let i = 0; i <= samples; i++) {
        motion.currentTime = motion.effect.getTiming().duration * i / samples;
        const r = box(body), center = box(resident);
        const x = center.left + center.width / 2, y = center.top + center.height / 2;
        const obstacle = hazards.find(([, bounds]) => overlaps(r, bounds));
        if (obstacle && !hit) hit = [obstacle[0], Math.round(x), Math.round(y)];
        if (i === samples) arrival = centers.find(p => Math.hypot(x - p.x, y - p.y) < 8)?.name;
    }
    motion.finish();
    return {length, hit, arrival};
}"""


def follow_route(page, resident):
    stops = set()
    came_home = False
    for _ in range(48):
        result = resident.evaluate(SAMPLE_WALK)
        if result:
            assert not result["hit"], (page.viewport_size, result)
            name = result.get("arrival")
            if name == ".room-presence":
                came_home = len(stops) == 2
            elif name and result["length"] > 30:
                stops.add(name)
                if came_home:
                    return
        page.clock.fast_forward(2500)
        page.wait_for_timeout(50)
    raise AssertionError(("Incomplete trip through both lanes and home", page.viewport_size, stops, came_home))


def check_layout(browser, base, width, height, touch=False):
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch, has_touch=touch)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.clock.install()
    # Select the studio visits consistently. Movement, layout and geometry come
    # from the running page, including the corners on the way around the decks.
    page.add_init_script("Math.random = () => 0.25")
    page.goto(base, wait_until="domcontentloaded")
    resident = page.locator(".room-resident")
    resident.wait_for()
    anchor = page.locator(".room-presence")
    assert math.dist(position(resident), position(anchor)) < 90, (page.viewport_size, position(resident))
    tabs = page.locator(".controller-tabs")
    if tabs.is_visible():
        tabs.locator('[data-panel=mixer]').tap()
    follow_route(page, resident)

    # A real press reaches the resident, while the surrounding faders and tabs
    # remain usable. A second press keeps the existing stronger daily reaction.
    for count in (1, 2):
        x, y = position(resident)
        (page.touchscreen.tap if touch else page.mouse.click)(x, y)
        assert resident.get_attribute("data-state") == "angry"
        assert resident.get_attribute("data-anger-count") == str(count)
        page.clock.fast_forward(350)
    cross = page.locator("#cross")
    cross.click(trial=True)
    cross.focus()
    page.keyboard.press("ArrowRight")
    assert page.evaluate("DJEngine.snapshot().cross > 0")
    assert not errors, errors
    page.close()


def check_panel_change(browser, base):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                            reduced_motion="reduce")
    page.clock.install()
    page.add_init_script("Math.random = () => 0.25")
    page.goto(base, wait_until="domcontentloaded")
    resident = page.locator(".room-resident")
    resident.wait_for()
    tabs = page.locator(".controller-tabs")
    tabs.locator('[data-panel=mixer]').tap()
    before = position(resident)
    page.clock.fast_forward(40000)
    assert math.dist(before, position(resident)) < 1
    assert not resident.evaluate("el => el.getAnimations().some(a => a.effect.getKeyframes().some(k => k.transform))")

    page.emulate_media(reduced_motion="no-preference")
    walk_in_mixer = """async el => {
        const a = el.getAnimations().find(a => a.effect.getKeyframes().some(k => k.transform));
        if (!a) return false;
        await a.ready;
        a.currentTime = a.effect.getTiming().duration * .9;
        const r = el.getBoundingClientRect(), m = document.querySelector('#mixer').getBoundingClientRect();
        return r.x >= m.x && r.y >= m.y && r.right <= m.right && r.bottom <= m.bottom;
    }"""
    for _ in range(16):
        if resident.evaluate(walk_in_mixer):
            break
        page.clock.fast_forward(1250)
        page.wait_for_timeout(50)
    else:
        raise AssertionError("No active walk inside the mixer after enabling motion")

    def assert_clear(selector):
        page.clock.run_for(130)
        body = resident.locator(".resident-body").bounding_box()
        controls = page.locator(selector).all()
        assert controls and body, selector
        for control in controls:
            rect = control.bounding_box()
            if rect:
                assert (body["x"] + body["width"] <= rect["x"] + 1 or rect["x"] + rect["width"] <= body["x"] + 1
                        or body["y"] + body["height"] <= rect["y"] + 1 or rect["y"] + rect["height"] <= body["y"] + 1), selector

    tabs.locator('[data-panel=a]').tap()
    assert_clear("#deck-a :is(.dd-screen, .dd-jog, button, select, input)")
    page.locator('a[data-view=library]').tap()
    assert_clear("#collection")
    page.close()


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    if urlsplit(base).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Pass a local studio preview.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        for viewport in [(1440, 900, False), (1024, 768, False), (390, 844, True), (320, 640, True),
                         (844, 390, True), (667, 375, True)]:
            check_layout(browser, base, *viewport)
        check_panel_change(browser, base)
        browser.close()
    print("Resident studio routes, logo and control clearance, pointer and touch reactions passed.")
