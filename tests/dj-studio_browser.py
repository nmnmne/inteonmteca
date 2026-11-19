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
    for width, height in ((320, 640), (390, 844), (844, 390), (1366, 768), (1920, 1080), (3840, 2160)):
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
    page.locator("a[data-view=library]").click()
    assert not page.locator("#performance").is_visible()
    page.locator("#track-list .fav-button").first.click()
    page.locator("button[data-crate=starred]").click()
    assert page.locator("#track-list tr").count() == 1
    page.locator("button[data-crate=all]").click()
    page.locator("#search").fill("Echoes Resurface")
    assert page.locator("#track-list tr").count() == 1
    page.locator("#track-list button[data-action=B]").click()
    assert page.evaluate("DJEngine.snapshot().B.track.title") == "Echoes Resurface"

    # A refresh drops in-memory object URLs. The library must lazily restore the saved audio.
    page.locator("#import-files").set_input_files(import_fixture())
    page.wait_for_function("document.querySelector('#track-list .remove-track') !== null")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function(f"document.querySelectorAll('#track-list tr').length === {count + 1}")
    page.locator("[data-crate=imports]").click()
    row = page.locator("#track-list tr")
    assert row.count() == 1 and "Imported Track" in row.inner_text()
    row.locator("[data-action=A]").click()
    page.wait_for_function("DJEngine.snapshot().A.track.imported && DJEngine.snapshot().A.track.src.startsWith('blob:')")
    page.locator("a[data-view=studio]").click()
    page.locator("#deck-a .dd-play").click()
    page.wait_for_function("DJEngine.snapshot().A.time > .1")
    page.locator("#deck-a .dd-play").click()
    page.locator("a[data-view=library]").click()
    page.locator("#track-list .remove-track").click()
    page.locator("#remove-confirm").click()
    page.wait_for_function("document.querySelectorAll('#track-list tr').length === 0")
    assert page.evaluate("DJEngine.snapshot().A.track.title") == "Imported Track"
    assert page.evaluate("DJStorage.list().then(rows => rows.length)") == 0

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
        browser.close()
    print("Studio playback, recording, library persistence, MIDI dialog and responsive layout passed.")
