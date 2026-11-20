"""Check the compact DJ surface against the real library and streaming decks."""
import sys
import wave
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def check(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch,
                            reduced_motion="reduce")
    page.goto(url, wait_until="domcontentloaded")
    compact = page.locator("#yard-dj-compact")
    waveform = compact.locator("canvas.dd-wave")
    waveform.wait_for()
    opening_a = page.evaluate("DJEngine.snapshot().A.track.id")
    assert opening_a == page.evaluate("DJStudioLibrary.list()[0].id")
    bottom = compact.locator(".compact-display").bounding_box()
    clear = bottom["y"]
    assert clear >= .56 * height and bottom["x"] >= 0 and bottom["x"] + bottom["width"] <= width
    assert compact.locator("[data-resident-obstacle]:visible").count() == 1

    compact.get_by_role("button", name="Дека B", exact=True).click()
    page.wait_for_function("document.querySelector('#yard-dj-compact #dd-sunset-clip path')?.getAttribute('d')")
    assert waveform.get_attribute("aria-label").endswith("B")
    page.evaluate("window.initialCompactWave = document.querySelector('#yard-dj-compact canvas')")
    track = compact.locator("#compact-track-select")
    track.click()
    picker = compact.locator("#compact-picker")
    options = picker.get_by_role("listbox")
    row = options.get_by_role("option").first
    assert abs(options.bounding_box()["height"] - 4 * row.bounding_box()["height"]) < 1
    if touch:
        before = options.evaluate("el => el.scrollTop")
        box = options.bounding_box()
        cdp = page.context.new_cdp_session(page)
        for kind, fraction in (("touchStart", .8), ("touchMove", .6), ("touchMove", .3), ("touchEnd", None)):
            points = [] if fraction is None else [{"x": box["x"] + box["width"] / 2,
                                                   "y": box["y"] + box["height"] * fraction}]
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
        page.wait_for_function("n => document.querySelector('#compact-picker [role=listbox]').scrollTop > n+5", arg=before)
    search = picker.get_by_role("searchbox")
    search.fill("Deadsouls")
    assert options.get_by_role("option").count() == 1
    search.fill("")
    ids = page.evaluate("DJStudioLibrary.list().map(t=>t.id)")
    options.press("Home")
    options.press("Enter")
    assert picker.is_hidden()
    page.wait_for_function("id => DJEngine.snapshot().B.track.id === id", arg=ids[0])
    box = waveform.bounding_box()
    point = {"x": round(box["width"] * .65), "y": round(box["height"] / 2)}
    if touch:
        waveform.tap(position=point)
    else:
        waveform.click(position=point)
    page.wait_for_function("() => {const s=DJEngine.snapshot().B;return Math.abs(s.time/s.duration-.65)<.015}")
    compact.locator(".compact-play").click()
    page.wait_for_function("DJEngine.snapshot().B.playing && DJEngine.snapshot().B.level > .001")
    waveform.focus()
    page.keyboard.down("m")
    page.wait_for_function("DJEngine.visuals.paused && DJEngine.snapshot().B.playing")
    page.keyboard.up("m")
    page.wait_for_function("!DJEngine.visuals.paused && DJEngine.snapshot().meters.left > .001")
    compact.locator(".compact-next").click()
    staged = """([source,target]) => { const {A,B} = DJEngine.snapshot();
        return B.playing && B.track?.id === source && A.playing && A.track?.id === target; }"""
    page.wait_for_function(staged, arg=[ids[0], ids[1]])
    compact.locator(".compact-next").click()
    page.wait_for_function(staged, arg=[ids[0], ids[2]])
    compact.locator(".compact-previous").click()
    page.wait_for_function(staged, arg=[ids[0], ids[1]])
    compact.locator(".compact-previous").click()
    page.wait_for_function("""id => { const {A,B} = DJEngine.snapshot();
        return B.playing && B.track?.id === id && !B.loopBeats && !A.playing; }""", arg=ids[0])

    compact.get_by_role("button", name="Дека A", exact=True).click()
    compact.locator(".compact-next").click()
    page.wait_for_function("""([source,target]) => { const {A,B} = DJEngine.snapshot();
        return B.playing && B.track?.id === source && !A.playing && A.track?.id === target; }""",
        arg=[ids[0], ids[2]])
    compact.get_by_role("button", name="Дека B", exact=True).click()
    waveform.press("p")
    page.wait_for_function("!DJEngine.snapshot().B.playing")
    compact.locator(".compact-sound").click()
    assert page.locator("#grid-deck").input_value() == "B"
    page.locator("#dialog-close").click()
    compact.locator("[data-dj-mode=full]").click()
    assert page.locator("#deck-b .dd-wave").evaluate("el => el === window.initialCompactWave")
    page.locator("#studio [data-dj-mode=compact]").click()
    assert waveform.evaluate("el => el === window.initialCompactWave")
    assert compact.locator('[data-compact-side=B]').get_attribute("aria-pressed") == "true"

    if not touch:
        with TemporaryDirectory() as folder:
            local = Path(folder) / "TestArtist - TestImport.wav"
            with wave.open(str(local), "wb") as audio:
                audio.setparams((1, 2, 11025, 0, "NONE", ""))
                audio.writeframes(bytes(11025 * 2))
            cdp = page.context.new_cdp_session(page)
            box = waveform.bounding_box()
            drag = {"items": [], "files": [str(local)], "dragOperationsMask": 1}
            for event in ("dragEnter", "dragOver", "drop"):
                cdp.send("Input.dispatchDragEvent", {"type": event, "x": box["x"] + box["width"]/2,
                         "y": box["y"] + box["height"]/2, "data": drag})
            page.wait_for_function("DJEngine.snapshot().B.track?.title==='TestImport'")
            assert page.evaluate("DJEngine.snapshot().A.track.id") == ids[2]
            track.click()
            assert options.get_by_role("option").filter(has_text="TestImport").count() == 1
    print(f"{width} × {height}, {clear:.0f}px clear above the player", flush=True)
    page.close()


if __name__ == "__main__":
    address = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    if urlsplit(address).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Pass the local studio preview URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        for viewport in ((1440, 900, False), (390, 844, True), (320, 640, True), (667, 375, True)):
            check(browser, address, *viewport)
        browser.close()
