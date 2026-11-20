"""Exercise the browser studio against a local site server in a fresh Edge profile."""
import io
import sys
import wave
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def import_fixture():
    with io.BytesIO() as buffer:
        with wave.open(buffer, "wb") as wav:
            wav.setparams((1, 2, 11025, 0, "NONE", ""))
            wav.writeframes(bytes(11025 * 2 * 4))
        return {"name": "QA - Imported Track.wav", "mimeType": "audio/wav", "buffer": buffer.getvalue()}


def check_controller_layout(page):
    console = page.locator("#studio")
    for width, height in ((320, 640), (390, 844), (844, 390), (932, 430), (1366, 768), (1920, 1080), (3840, 2160)):
        page.set_viewport_size({"width": width, "height": height})
        page.evaluate("window.scrollTo(0, 0)")
        pane = console.bounding_box()
        bank = page.locator(".deck-bank").bounding_box()
        assert 0 <= pane["x"] and pane["x"] + pane["width"] <= width + 1, (width, pane)
        assert pane["width"] >= width * .94 and pane["height"] >= height * .77, (width, height, pane)
        assert pane["width"] * .90 <= bank["width"] <= pane["width"], (width, bank, pane)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        tabs = page.locator(".controller-tabs")
        if tabs.is_visible():
            tabs.locator('[data-panel=b]').click()
            assert page.locator("#deck-b").is_visible()
            tabs.locator('[data-panel=mixer]').click()
            assert page.locator("#cross").is_visible()
            tabs.locator('[data-panel=a]').click()
        for side in (["a"] if tabs.is_visible() else ["a", "b"]):
            wheel = page.locator(f"#deck-{side} .dd-wheel-mount").bounding_box()
            assert wheel["width"] >= 75 and abs(wheel["width"] - wheel["height"]) < 1, (width, wheel)
            wave = page.locator(f"#deck-{side} .dd-wave").bounding_box()
            assert wave["height"] >= 22, (width, height, wave)
            page.locator(f"#deck-{side} .dd-play").click(trial=True)
        page.locator("#mobile-cross" if tabs.is_visible() else "#cross").click(trial=True)
    if page.evaluate("document.fullscreenEnabled"):
        page.locator("#expand").click()
        page.wait_for_function("document.fullscreenElement === document.documentElement")
        assert console.bounding_box()["width"] >= page.evaluate("innerWidth") * .94
        assert page.locator("#deck-a .dd-wheel-mount").is_visible()
        page.locator("#expand").click()
        page.wait_for_function("!document.fullscreenElement")


def scratch_catalogue(page):
    page.evaluate("DJEngine.seek('A',30); DJEngine.setCross(-1)")
    page.wait_for_function("DJEngine.snapshot().A.scratchStatus === 'ready'")
    wheel = page.locator("#deck-a .dd-jog").bounding_box()
    x = wheel["x"] + wheel["width"] * .5
    y = wheel["y"] + wheel["height"] * .5
    page.mouse.move(x, y)
    page.mouse.down()
    page.wait_for_function("DJEngine.snapshot().A.scratching")
    peak = 0
    for step in range(1, 19):
        page.mouse.move(x + wheel["width"] * .016 * step, y)
        page.wait_for_timeout(12)
        peak = max(peak, page.evaluate("DJEngine.snapshot().meters.left"))
    page.mouse.up()
    assert peak > .01 and page.evaluate("!DJEngine.snapshot().A.playing"), peak
    page.locator("#deck-a .dd-play").click()
    page.wait_for_function("DJEngine.snapshot().meters.left>.04")
    page.keyboard.down("z")
    page.wait_for_function("DJEngine.snapshot().meters.left<.001")
    page.keyboard.up("z")
    page.wait_for_function("DJEngine.snapshot().meters.left>.04")
    page.locator("#curve-cross").click()
    page.locator('#curve-cross[aria-pressed="true"]').wait_for()
    page.evaluate("DJEngine.setCross(.85)")
    page.wait_for_function("DJEngine.snapshot().meters.left>.04")
    page.evaluate("DJEngine.setCross(1)")
    page.wait_for_function("DJEngine.snapshot().meters.left<.001")
    page.locator("#deck-a .dd-play").click()
    page.locator("#center-cross").click()
    page.locator("#curve-cross").click()


def check_deck_browser(page):
    a = page.locator("#deck-a")
    b = page.locator("#deck-b")
    a_toggle = a.locator(".dd-browse-toggle")
    b_toggle = b.locator(".dd-browse-toggle")
    selected_title = "[role=option][aria-selected=true] .dd-browse-title"
    original_a, original_b = page.evaluate("[DJEngine.snapshot().A.track.title, DJEngine.snapshot().B.track.title]")
    assert (original_a, original_b) == ("Echoes Resurface", "High Stage Of Reality")
    page.locator("a[data-view=library]").click()
    page.locator("#search").fill("no-match-in-the-catalogue")
    assert page.locator("#track-list tr").count() == 0
    page.locator("a[data-view=studio]").click()
    a.locator(".dd-zoom").click()
    wave = a.locator(".dd-wave")
    size = wave.bounding_box()
    wave.click(position={"x": round(size["width"] * .75), "y": round(size["height"] / 2)})
    page.wait_for_function("() => {const s = DJEngine.snapshot().A; return Math.abs(s.time/s.duration - .375) < .01}")
    a.locator(".dd-pitch-range").select_option("16")
    a.locator("[data-jog=bend]").click()
    a.locator(".dd-lock").click()
    a.locator(".dd-loop-plus").click()
    a.locator(".dd-loop").click()
    a.locator(".dd-loop-minus").click()
    assert page.evaluate("DJEngine.snapshot().A.loopBeats") == 4
    a.locator(".dd-loop-plus").click()
    assert page.evaluate("DJEngine.snapshot().A.loopBeats") == 8
    page.evaluate("""() => {
        DJEngine.setEQ('A','low',-8); DJEngine.setFilter('A',.7); DJEngine.setEcho('A',.45);
        DJEngine.setChannel('A',.3); DJEngine.setTempo('A',4); DJEngine.setBend('A',1);
        DJEngine.setEQ('B','high',3); DJEngine.setCross(.25); DJEngine.setMaster(.64);
    }""")
    b.locator(".dd-play").click()
    page.wait_for_function("DJEngine.snapshot().B.time > .1")
    b_toggle.click()
    assert b.locator(selected_title).inner_text() == original_b
    a_toggle.click()
    a_list = a.get_by_role("listbox")
    assert a_list.evaluate("el => document.activeElement === el")
    titles = a_list.locator(".dd-browse-title").all_text_contents()
    assert len(titles) >= 3 and a.locator(selected_title).inner_text() == original_a
    b_filter = b.locator(".dd-browse-filter")
    b_filter.press("ArrowDown")
    assert b_filter.input_value() == "starred"
    assert b.get_by_role("listbox").get_by_role("option").count() == 0
    assert b.locator(".dd-browse-load").is_disabled()
    assert a.locator(".dd-browse-filter").input_value() == "all"
    b_filter.select_option("all")
    a_list.focus()
    for direction, index in (("Home", 0), ("ArrowDown", 1), ("ArrowDown", 2), ("ArrowUp", 1), ("Home", 0)):
        page.keyboard.press(direction)
        assert a.locator(selected_title).inner_text() == titles[index]
        assert a_list.evaluate("""el => document.getElementById(el.getAttribute('aria-activedescendant'))
            === el.querySelector('[aria-selected=true]')""")
    assert page.evaluate("DJEngine.snapshot().A.track.title") == original_a
    assert a.locator("[role=option][aria-current=true] .dd-browse-title").inner_text() == original_a
    assert b.locator(selected_title).inner_text() == original_b
    page.keyboard.press("Enter")
    a_list.wait_for(state="hidden")
    assert a_toggle.evaluate("el => document.activeElement === el")
    page.wait_for_function("""expected => {
        const {A, B, cross, master} = DJEngine.snapshot();
        return A.track.title === expected && !A.playing && !A.scratching && A.time === 0
            && A.keyLock && A.tempo === 0 && A.bend === 0 && A.loopBeats === 0 && A.eq.low === 0
            && A.echo === 0 && A.filter === 0 && A.channel === .8 && B.eq.high === 3
            && B.playing && cross === .25 && master === .64;
    }""", arg=titles[0])
    assert a.locator(".dd-loop-value").text_content() == "4"
    assert a.locator(".dd-pitch-range").input_value() == "8"
    assert a.locator("[data-jog=scratch]").get_attribute("aria-pressed") == "true"
    assert a.locator(".dd-zoom span").inner_text() == "1×"
    b.get_by_role("listbox").focus()
    page.keyboard.press("Escape")
    assert b_toggle.evaluate("el => document.activeElement === el")
    assert page.evaluate("DJEngine.snapshot().B.playing && DJEngine.snapshot().B.track.title") == original_b
    b.locator(".dd-zoom").click()
    b.locator(".dd-loop-plus").click()
    b_toggle.click()
    page.keyboard.press("Enter")
    b.get_by_role("listbox").wait_for(state="hidden")
    page.wait_for_function("!DJEngine.snapshot().B.playing && DJEngine.snapshot().B.eq.high === 0 && DJEngine.snapshot().B.time === 0")
    assert b.locator(".dd-zoom span").inner_text() == "1×"
    assert b.locator(".dd-loop-value").text_content() == "4"


def check_touch_browser(browser, url):
    page = browser.new_page(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True)
    page.goto(url, wait_until="domcontentloaded")
    page.locator(".controller-tabs [data-panel=b]").tap()
    b = page.locator("#deck-b")
    b.locator(".dd-browse-toggle").tap()
    options = b.get_by_role("listbox").get_by_role("option")
    options.first.tap()
    b.locator(".dd-browse-down").tap()
    b.locator(".dd-browse-up").tap()
    selected = b.locator("[aria-selected=true] .dd-browse-title").inner_text()
    assert selected == options.first.locator(".dd-browse-title").inner_text()
    assert page.evaluate("DJEngine.snapshot().B.track.title") != selected
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    b.locator(".dd-browse-load").tap()
    b.get_by_role("listbox").wait_for(state="hidden")
    assert page.evaluate("DJEngine.snapshot().B.track.title") == selected
    page.set_viewport_size({"width": 667, "height": 375})
    assert b.locator(".dd-wave").bounding_box()["height"] >= 22
    page.close()


def exercise(browser, url):
    page = browser.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector("#track-list tr", state="attached")
    count = page.evaluate("INTEONMTECA_PLAYLIST.length")
    assert page.locator("#track-list tr").count() == count
    scratch_catalogue(page)

    # Start real catalogue FLACs, then record the mixed master through the visible controls.
    for deck in ("a", "b"):
        page.locator(f"#deck-{deck} .dd-play").click()
    page.wait_for_function("""() => {
        const s = DJEngine.snapshot();
        return s.A.time > .2 && s.B.time > .2 && s.meters.left > .001;
    }""")
    page.locator("#record").click()
    page.wait_for_function("DJEngine.snapshot().recordingSeconds > 1")
    with page.expect_download() as download:
        page.locator("#record").click()
    assert Path(download.value.path()).stat().st_size > 100
    for deck in ("a", "b"):
        page.locator(f"#deck-{deck} .dd-play").click()

    page.locator("#deck-a .dd-pad").first.click()
    saved_pad = page.evaluate("DJEngine.snapshot().A.hotCues[0]")
    assert saved_pad is not None
    page.locator("#deck-b .dd-zoom").click()
    page.locator("#deck-b .dd-loop-minus").click()
    page.evaluate("DJEngine.setFilter('B',-.6)")
    page.locator("a[data-view=library]").click()
    assert not page.locator("#performance").is_visible()
    page.locator("#track-list .fav-button").first.click()
    page.locator("button[data-crate=starred]").click()
    assert page.locator("#track-list tr").count() == 1
    page.locator("button[data-crate=all]").click()
    page.locator("#search").fill("Echoes Resurface")
    assert page.locator("#track-list tr").count() == 1
    page.locator("#track-list button[data-action=B]").click()
    assert page.evaluate("DJEngine.snapshot().B.track.title === 'Echoes Resurface' && DJEngine.snapshot().B.filter === 0")
    assert page.evaluate("DJEngine.snapshot().B.hotCues[0]") == saved_pad
    page.locator("a[data-view=studio]").click()
    assert page.locator("#deck-b .dd-loop-value").text_content() == "4"
    assert page.locator("#deck-b .dd-zoom span").inner_text() == "1×"
    page.locator("a[data-view=library]").click()

    # A refresh drops in-memory object URLs. The library must lazily restore the saved audio.
    page.locator("#import-files").set_input_files(import_fixture())
    page.wait_for_function("document.querySelector('#track-list .remove-track') !== null")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function(f"document.querySelectorAll('#track-list tr').length === {count + 1}")
    page.locator("[data-crate=imports]").click()
    row = page.locator("#track-list tr")
    assert row.count() == 1 and "Imported Track" in row.inner_text()
    page.locator("a[data-view=studio]").click()
    a = page.locator("#deck-a")
    a.locator(".dd-browse-toggle").click()
    a.locator(".dd-browse-filter").select_option("imports")
    assert a.get_by_role("listbox").get_by_role("option").count() == 1
    assert a.locator("[aria-selected=true] .dd-browse-title").inner_text() == "Imported Track"
    a.locator(".dd-browse-load").click()
    page.wait_for_function("DJEngine.snapshot().A.track.imported && DJEngine.snapshot().A.track.src.startsWith('blob:')")
    page.locator("#deck-a .dd-play").click()
    page.wait_for_function("DJEngine.snapshot().A.time > .1")
    page.locator("#deck-a .dd-play").click()
    page.locator("a[data-view=library]").click()
    page.locator("#track-list .remove-track").click()
    page.locator("#remove-confirm").click()
    page.wait_for_function("document.querySelectorAll('#track-list tr').length === 0")
    assert page.evaluate("DJEngine.snapshot().A.track.title") == "Imported Track"
    assert page.evaluate("DJStorage.list().then(rows => rows.length)") == 0
    page.locator("a[data-view=studio]").click()
    page.locator("#deck-a .dd-browse-toggle").click()
    assert a.locator(".dd-browse-filter").input_value() == "imports"
    assert page.locator("#deck-a [role=option]").count() == 0
    assert page.locator("#deck-a .dd-browse-load").is_disabled()
    page.keyboard.press("Escape")

    page.locator("#settings-open").click()
    page.locator("#midi-open").click()
    assert page.locator("dialog[open]").count() == 2
    page.keyboard.press("Escape")
    page.keyboard.press("Escape")
    page.locator("a[data-view=studio]").click()
    for width in (320, 390, 768, 1024, 1440):
        page.set_viewport_size({"width": width, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    check_controller_layout(page)
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    if urlparse(url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Pass the local studio preview URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        exercise(browser, url)
        browsing = browser.new_page(viewport={"width": 1440, "height": 900})
        browsing.goto(url, wait_until="domcontentloaded")
        check_deck_browser(browsing)
        browsing.close()
        check_touch_browser(browser, url)
        browser.close()
    print("Studio playback, recording, library persistence, MIDI dialog, deck browsing and responsive layout passed.")
