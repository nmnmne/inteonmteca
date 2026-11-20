"""Exercise the digital jog, stationary display, rim and simultaneous touches through the deck UI."""
import base64
import io
import math
import sys
import wave
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def load_fixture(page, url):
    with io.BytesIO() as stream:
        with wave.open(stream, "wb") as wav:
            wav.setparams((1, 2, 22050, 8 * 22050, "NONE", ""))
            wav.writeframes(bytes(8 * 22050 * 2))
        encoded = base64.b64encode(stream.getvalue()).decode()
    page.goto(url)
    page.locator("#deck-a .dd-jog").wait_for()
    page.evaluate("""encoded => {
      const pcm = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      window.vinylFixture = {id:'gesture-a', title:'Gesture QA', bpm:120, duration:8,
        src:URL.createObjectURL(new Blob([pcm],{type:'audio/wav'}))};
      DJEngine.load('A', vinylFixture);
      DJEngine.seek('A', 4);
    }""", encoded)
    page.wait_for_function("DJEngine.snapshot().A.scratchStatus === 'ready' && Math.abs(DJEngine.snapshot().A.time - 4) < .02")


def circle(page):
    jog = page.locator("#deck-a .dd-jog")
    jog.scroll_into_view_if_needed()
    box = jog.bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, box["width"] / 2


def check_mouse_and_keys(page, url):
    load_fixture(page, url)
    mouse = page.mouse
    x, y, r = circle(page)
    display = page.locator("#deck-a .dd-jog-readout")
    display_box = display.bounding_box()
    state = lambda: page.evaluate("DJEngine.snapshot().A")

    def go(deg, radius):
        angle = math.radians(deg)
        mouse.move(x + r * radius * math.cos(angle), y + r * radius * math.sin(angle))

    go(145, .73)
    mouse.down()
    assert state()["scratching"]
    for angle in range(150, 236, 5):
        go(angle, .73)
    assert abs(state()["time"] - 4.45) < .012, state()["time"]
    forward = page.locator("#deck-a .dd-platter").evaluate("p => p.style.transform")
    assert display.bounding_box() == display_box
    # Moving focus to the fader with a second hand must preserve the grip.
    page.locator("#cross").focus()
    assert state()["scratching"]
    for angle in range(230, 144, -5):
        go(angle, .73)
    assert abs(state()["time"] - 4) < .012
    assert page.locator("#deck-a .dd-platter").evaluate("p => p.style.transform") != forward
    mouse.up()
    assert not state()["scratching"] and not state()["playing"]

    go(0, .979)
    mouse.down()
    for angle in range(5, 41, 5):
        go(angle, .979)
    assert state()["bend"] > 2 and not state()["scratching"]
    mouse.up()
    assert state()["bend"] == 0

    for mode, field in [("bend", "bend"), ("tempo", "tempo")]:
        page.locator(f'#deck-a [data-jog="{mode}"]').click()
        go(-90, .73)
        mouse.down()
        for angle in range(-85, -44, 5):
            go(angle, .73)
        assert state()[field] > 1 and not state()["scratching"]
        mouse.up()
    assert state()["tempo"] > 1 and state()["bend"] == 0
    page.locator('#deck-a [data-rate="reset"]').click()
    page.locator('#deck-a [data-jog="scratch"]').click()
    mouse.move(x, y)
    mouse.down()
    mouse.move(x + 24, y, steps=6)
    assert state()["time"] > 4.02
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    assert not state()["scratching"]
    mouse.up()
    page.locator("#deck-a .dd-jog").focus()
    start = state()["time"]
    page.keyboard.down("ArrowLeft")
    page.wait_for_function("t => DJEngine.snapshot().A.time < t - .09", arg=start)
    page.keyboard.up("ArrowLeft")
    assert not state()["scratching"]
    mouse.down()
    page.evaluate("DJEngine.load('A', {...vinylFixture, id:'gesture-b', title:'Second fixture'})")
    page.wait_for_function("!document.querySelector('#deck-a .dd-dragging')")
    mouse.move(x - 30, y)
    mouse.up()
    assert not state()["scratching"] and state()["time"] < .01


def check_touch(browser, url):
    page = browser.new_page(viewport={"width":390,"height":844}, has_touch=True, is_mobile=True)
    load_fixture(page, url)
    x, y, _ = circle(page)
    fader = page.locator("#mobile-cross").bounding_box()
    cdp = page.context.new_cdp_session(page)

    def send(kind, touches):
        cdp.send("Input.dispatchTouchEvent", {"type":kind,"touchPoints":touches})

    vinyl = {"x":x,"y":y,"id":1}
    slider = {"x":fader["x"] + fader["width"] / 2, "y":fader["y"] + fader["height"] / 2, "id":2}
    send("touchStart", [vinyl])
    send("touchStart", [vinyl, slider])
    send("touchMove", [{**vinyl, "y":y - 30}, {**slider, "x":slider["x"] + fader["width"] / 3}])
    assert page.evaluate("DJEngine.snapshot().A.scratching && DJEngine.snapshot().A.time > 4.02 && DJEngine.snapshot().cross > .3")
    send("touchCancel", [])
    assert page.evaluate("!DJEngine.snapshot().A.scratching && !DJEngine.snapshot().A.playing")
    page.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    if urlsplit(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Pass the local studio preview URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        try:
            check_mouse_and_keys(browser.new_page(viewport={"width":1440,"height":900}), url)
            check_touch(browser, url)
        finally:
            browser.close()
    print("Digital jog in both directions, stationary display, rim nudge, two-finger fader and keyboard passed.")
