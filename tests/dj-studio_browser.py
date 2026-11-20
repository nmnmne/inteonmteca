"""Exercise the browser studio against a local site server in a fresh Edge profile."""
import io
import hashlib
import math
import sys
import wave
from array import array
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from studio_window import open_full_studio


def import_fixture():
    with io.BytesIO() as buffer:
        with wave.open(buffer, "wb") as wav:
            wav.setparams((1, 2, 11025, 0, "NONE", ""))
            wav.writeframes(bytes(11025 * 2 * 4))
        return {"name": "QA - Imported Track.wav", "mimeType": "audio/wav", "buffer": buffer.getvalue()}


def check_display(screen):
    track = screen.locator(".dd-track").bounding_box()
    state = screen.locator(".dd-deck-state").bounding_box()
    wave = screen.locator(".dd-wave").bounding_box()
    playlist = screen.get_by_role("listbox")
    bounds = playlist.bounding_box()
    assert track and state and wave and bounds
    assert playlist.evaluate("""list => getComputedStyle(list).scrollbarWidth === 'none'
        && list.scrollWidth === list.clientWidth""")
    assert state["y"] + state["height"] <= wave["y"] + 1
    assert track["y"] + track["height"] <= wave["y"] and wave["y"] + wave["height"] <= bounds["y"]
    for section in (track, wave):
        assert abs(section["x"] - bounds["x"]) < 1 and abs(section["width"] - bounds["width"]) < 1
    assert wave["height"] >= 24
    rows = playlist.get_by_role("option")
    if rows.count() >= 4:
        visible = playlist.evaluate("""list => {
            const bounds = list.getBoundingClientRect();
            return Array.from(list.children).filter(option => {
                const row = option.getBoundingClientRect();
                return row.top >= bounds.top - 1 && row.bottom <= bounds.bottom + 1;
            }).length;
        }""")
        assert visible == 4
        assert abs(bounds["height"] - 4 * rows.first.bounding_box()["height"]) < 1


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
            screen = page.locator(f"#deck-{side} .dd-screen")
            check_display(screen)
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


def choose_collection(deck, value):
    deck.locator(".dd-browse-options").click()
    filtering = deck.locator(".dd-browse-filter")
    filtering.select_option(value)
    if filtering.is_visible():
        filtering.press("Escape")


def check_deck_browser(page):
    a = page.locator("#deck-a")
    b = page.locator("#deck-b")
    a_list = a.get_by_role("listbox")
    b_list = b.get_by_role("listbox")
    selected_title = "[role=option][aria-selected=true] .dd-browse-title"
    original_a, original_b = page.evaluate("[DJEngine.snapshot().A.track.title, DJEngine.snapshot().B.track.title]")
    assert (original_a, original_b) == ("Memphis", "High Stage Of Reality")
    assert a_list.is_visible() and b_list.is_visible()
    assert a.locator(".dd-wave").is_visible() and b.locator(".dd-wave").is_visible()
    a_list.hover()
    page.mouse.wheel(0, 160)
    page.wait_for_function("document.querySelector('#deck-a [role=listbox]').scrollTop >= 20")
    search = a.locator(".dd-browse-search")
    search.fill("no-match-in-the-catalogue")
    assert a_list.get_by_role("option").count() == 0 and a.locator(".dd-browse-load").is_disabled()
    assert b_list.get_by_role("option").count() > 2
    search.fill("")
    wave = a.locator(".dd-wave")
    assert a.locator(".dd-scope [role=slider], .dd-scope input[type=range]").count() == 1
    wave.scroll_into_view_if_needed()
    size = wave.bounding_box()
    y = size["y"] + size["height"] / 2
    page.mouse.move(size["x"] + size["width"] * .15, y)
    page.mouse.down()
    page.mouse.move(size["x"] + size["width"] * .89, y, steps=5)
    page.mouse.up()
    page.wait_for_function("() => {const s = DJEngine.snapshot().A; return Math.abs(s.time/s.duration - .89) < .01}")
    wave.press("Home")
    wave.press("Shift+ArrowRight")
    page.wait_for_function("() => {const s=DJEngine.snapshot().A; return Math.abs(s.time - 60 / s.baseBPM / 8) < .01}")
    wave.press("Home")
    a.locator(".dd-zoom").click()
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
    assert b.locator(selected_title).text_content() == original_b
    a_list.focus()
    titles = a_list.locator(".dd-browse-title").all_text_contents()
    assert len(titles) >= 3 and titles[0] == original_a
    assert a.locator(selected_title).text_content() == original_a
    choose_collection(b, "starred")
    assert b.get_by_role("listbox").get_by_role("option").count() == 0
    assert b.locator(".dd-browse-load").is_disabled()
    assert a.locator(".dd-browse-filter").input_value() == "all"
    choose_collection(b, "all")
    b.locator(".dd-browse-options").click()
    sorting = b.locator(".dd-browse-sort")
    for order in ("bpm", "-bpm"):
        sorting.select_option(order)
        tempos = [float(value) for value in b_list.locator(".dd-browse-bpm").all_text_contents() if value != "—"]
        assert len(tempos) >= 2 and tempos == sorted(tempos, reverse=order.startswith("-"))
    sorting.select_option("")
    sorting.press("Escape")
    assert a_list.locator(".dd-browse-title").all_text_contents() == titles
    a_list.focus()
    for direction, index in (("Home", 0), ("ArrowDown", 1), ("ArrowDown", 2), ("ArrowUp", 1), ("Home", 0)):
        page.keyboard.press(direction)
        assert a.locator(selected_title).text_content() == titles[index]
        assert a_list.evaluate("""el => document.getElementById(el.getAttribute('aria-activedescendant'))
            === el.querySelector('[aria-selected=true]')""")
    assert page.evaluate("DJEngine.snapshot().A.track.title") == original_a
    assert a.locator("[role=option][aria-current=true] .dd-browse-title").text_content() == original_a
    assert b.locator(selected_title).text_content() == original_b
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    assert a_list.is_visible()
    page.wait_for_function("""expected => {
        const {A, B, cross, master} = DJEngine.snapshot();
        return A.track.title === expected && !A.playing && !A.scratching && A.time === 0
            && A.keyLock && A.tempo === 0 && A.bend === 0 && A.loopBeats === 0 && A.eq.low === 0
            && A.echo === 0 && A.filter === 0 && A.channel === .8 && B.eq.high === 3
            && B.playing && cross === .25 && master === .64;
    }""", arg=titles[1])
    assert a.locator(".dd-loop-value").text_content() == "4"
    assert a.locator(".dd-pitch-range").input_value() == "8"
    assert a.locator("[data-jog=scratch]").get_attribute("aria-pressed") == "true"
    assert a.locator(".dd-zoom span").inner_text() == "1×"
    b_list.focus()
    page.keyboard.press("Escape")
    assert b_list.is_visible()
    assert page.evaluate("DJEngine.snapshot().B.playing && DJEngine.snapshot().B.track.title") == original_b
    b.locator(".dd-zoom").click()
    b.locator(".dd-loop-plus").click()
    b_list.press("Enter")
    assert b_list.is_visible()
    page.wait_for_function("!DJEngine.snapshot().B.playing && DJEngine.snapshot().B.eq.high === 0 && DJEngine.snapshot().B.time === 0")
    assert b.locator(".dd-zoom span").inner_text() == "1×"
    assert b.locator(".dd-loop-value").text_content() == "4"
    a.locator(".dd-browse-search").fill("Echoes Resurface")
    transfer = a_list.get_by_role("option")
    title = transfer.locator(".dd-browse-title").text_content()
    transfer.drag_to(b.locator(".dd-jog"))
    page.wait_for_function("title => DJEngine.snapshot().B.track.title === title", arg=title)
    assert b_list.locator('[aria-current=true] .dd-browse-title').text_content() == title
    assert page.evaluate("DJEngine.snapshot().A.track.title") == titles[1]


def check_touch_browser(browser, url):
    page = browser.new_page(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True)
    page.goto(url, wait_until="domcontentloaded")
    open_full_studio(page)
    page.locator(".controller-tabs [data-panel=b]").tap()
    b = page.locator("#deck-b")
    assert b.get_by_role("listbox").is_visible() and b.locator(".dd-wave").is_visible()
    check_display(b.locator(".dd-screen"))
    playlist = b.get_by_role("listbox")
    playlist.scroll_into_view_if_needed()
    bounds = playlist.bounding_box()
    before = playlist.evaluate("el => el.scrollTop")
    cdp = page.context.new_cdp_session(page)
    for kind, fraction in (("touchStart", .8), ("touchMove", .6), ("touchMove", .3), ("touchEnd", None)):
        points = [] if fraction is None else [{"x": bounds["x"] + bounds["width"] / 2,
                                               "y": bounds["y"] + bounds["height"] * fraction}]
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
    page.wait_for_function("previous => document.querySelector('#deck-b [role=listbox]').scrollTop > previous + 10", arg=before)
    options = playlist.get_by_role("option")
    options.first.tap()
    b.locator(".dd-browse-down").tap()
    b.locator(".dd-browse-up").tap()
    selected = b.locator("[aria-selected=true] .dd-browse-title").text_content()
    assert selected == options.first.locator(".dd-browse-title").text_content()
    assert page.evaluate("DJEngine.snapshot().B.track.title") != selected
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    b.locator(".dd-browse-load").tap()
    assert b.get_by_role("listbox").is_visible()
    assert page.evaluate("DJEngine.snapshot().B.track.title") == selected
    waveform = b.locator(".dd-wave")
    waveform.scroll_into_view_if_needed()
    size = waveform.bounding_box()
    for kind, pos in (("touchStart", .15), ("touchMove", .79), ("touchEnd", None)):
        points = [] if pos is None else [{"x": size["x"] + size["width"] * pos,
                                          "y": size["y"] + size["height"] / 2}]
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
    page.wait_for_function("() => {const s=DJEngine.snapshot().B; return Math.abs(s.time/s.duration - .79) < .02}")
    page.set_viewport_size({"width": 667, "height": 375})
    check_display(b.locator(".dd-screen"))
    page.close()


def check_file_drops(browser, url):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto(url, wait_until="domcontentloaded")
    open_full_studio(page)
    page.locator("#deck-b [role=option]").first.wait_for()
    writes = []
    context.on("request", lambda req: writes.append((req.method, req.url))
               if req.url.startswith("http") and req.method not in {"GET", "HEAD", "OPTIONS"} else None)
    cdp = context.new_cdp_session(page)

    def drop_files(selector, paths):
        area = page.locator(selector)
        area.scroll_into_view_if_needed()
        box = area.bounding_box()
        drag = {"items": [], "files": [str(path) for path in paths], "dragOperationsMask": 1}
        for kind in ("dragEnter", "dragOver", "drop"):
            cdp.send("Input.dispatchDragEvent", {"type": kind, "x": box["x"] + box["width"] / 2,
                     "y": box["y"] + box["height"] / 2, "data": drag})

    with TemporaryDirectory() as folder:
        paths = []
        titles = ("Окна", "Медленный свет — Edit", "Над домом")
        for i, title in enumerate(titles):
            path = Path(folder) / f"Артист — {title}.wav"
            paths.append(path)
            with wave.open(str(path), "wb") as wav:
                wav.setparams((1, 2, 11025, 0, "NONE", ""))
                wav.writeframes(array("h", (int(8000 * math.sin(2 * math.pi * (220 + 110*i) * n / 11025))
                                             for n in range(33075))).tobytes())
        drop_files("#mixer", paths[:2])
        drop_files("#deck-b .dd-browse-list", paths[2:])
        page.wait_for_function("DJStorage.list().then(tracks => tracks.length === 3)")
        page.locator("#deck-b [role=option]").filter(has_text="Над домом").wait_for(state="attached")
        assert page.evaluate("[DJEngine.snapshot().A.track.title, DJEngine.snapshot().B.track.title]") == [
            "Memphis", "High Stage Of Reality"]
        # Read the exact original bytes after closing the tab (all object URLs are gone).
        page.close()
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded")
        open_full_studio(page)
        deck = page.locator("#deck-b")
        choose_collection(deck, "imports")
        for path, title in zip(paths, titles):
            deck.locator("[role=option]").filter(has_text=title).dblclick()
            page.wait_for_function("title => DJEngine.snapshot().B.track.title === title", arg=title)
            info = page.evaluate("""async () => {
              const t = DJEngine.snapshot().B.track;
              const bytes = await (await fetch(t.src)).arrayBuffer();
              const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
              return [t.artist, t.src.startsWith('blob:'), t.peaks.length, t.normalization.status,
                      Array.from(digest, b => b.toString(16).padStart(2,'0')).join('')];
            }""")
            assert info[:4] == ["Артист", True, 8192, "measured"], info
            assert info[-1] == hashlib.sha256(path.read_bytes()).hexdigest()
        deck.locator(".dd-play").click()
        page.wait_for_function("DJEngine.snapshot().B.time > .1 && DJEngine.snapshot().B.level > .01")
        # Storage pressure can leave an import in memory. A second drop should
        # persist that existing row once the browser can write again.
        retry = Path(folder) / "Recovered.wav"
        retry.write_bytes(import_fixture()["buffer"])
        cdp = context.new_cdp_session(page)
        page.evaluate("""() => {
            const put = DJStorage.put;
            DJStorage.put = async () => { DJStorage.put = put; return false; };
        }""")
        drop_files("#deck-a .dd-wave", [retry])
        page.get_by_text("Recovered · Трек доступен до закрытия вкладки.", exact=False).wait_for()
        assert page.evaluate("DJStorage.list().then(tracks => tracks.length)") == 3
        page.locator("#dialog-close").click()
        drop_files("#deck-a .dd-wave", [retry])
        page.wait_for_function("DJStorage.list().then(tracks => tracks.length === 4)")
        assert page.locator("#deck-a [role=option]").filter(has_text="Recovered").count() == 1
        assert not writes, writes
    context.close()


def exercise(browser, url):
    page = browser.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url.rstrip("/") + "/#library", wait_until="domcontentloaded")
    open_full_studio(page)
    page.wait_for_function("location.hash === '#studio'")
    a = page.locator("#deck-a")
    b = page.locator("#deck-b")
    a_rows = a.get_by_role("listbox").get_by_role("option")
    b_rows = b.get_by_role("listbox").get_by_role("option")
    a_rows.first.wait_for()
    count = page.evaluate("INTEONMTECA_PLAYLIST.length")
    assert a_rows.count() == b_rows.count() == count
    assert page.locator('#collection, [href="#library"]').count() == 0
    assert page.locator("#performance").is_visible()
    page.locator("#masters").click()
    assert page.locator("#master-track option").count() == count
    for ext in ("flac", "wv"):
        master = page.locator(f'#master-files a[download$=".{ext}"]')
        assert master.is_visible()
        assert page.request.head(master.evaluate("a => a.href")).ok
    page.locator("#dialog-close").click()
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
    a.locator(".dd-browse-star").click()
    starred_title = page.evaluate("DJEngine.snapshot().A.track.title")
    choose_collection(b, "starred")
    assert b_rows.count() == 1 and a_rows.count() == count
    choose_collection(b, "all")
    b.locator(".dd-browse-search").fill(starred_title)
    assert b_rows.count() == 1
    b_rows.dblclick()
    assert page.evaluate("title => DJEngine.snapshot().B.track.title === title && DJEngine.snapshot().B.filter === 0", starred_title)
    assert page.evaluate("DJEngine.snapshot().B.hotCues[0]") == saved_pad
    assert page.locator("#deck-b .dd-loop-value").text_content() == "4"
    assert page.locator("#deck-b .dd-zoom span").inner_text() == "1×"
    # Reloading drops in-memory object URLs. Both displays can still load the saved audio.
    with page.expect_file_chooser() as chooser:
        page.locator("#import").click()
    chooser.value.set_files(import_fixture())
    a_rows.filter(has_text="Imported Track").wait_for(state="attached")
    page.reload(wait_until="domcontentloaded")
    open_full_studio(page)
    a_rows.filter(has_text="Imported Track").wait_for(state="attached")
    assert a_rows.count() == b_rows.count() == count + 1
    choose_collection(b, "starred")
    assert b_rows.count() == 1 and starred_title in b_rows.text_content()
    choose_collection(a, "imports")
    assert a.get_by_role("listbox").get_by_role("option").count() == 1
    assert a.locator("[aria-selected=true] .dd-browse-title").text_content() == "Imported Track"
    a.locator(".dd-browse-load").click()
    page.wait_for_function("DJEngine.snapshot().A.track.imported && DJEngine.snapshot().A.track.src.startsWith('blob:')")
    page.locator("#deck-a .dd-play").click()
    page.wait_for_function("DJEngine.snapshot().A.time > .1")
    page.locator("#deck-a .dd-play").click()
    a.locator(".dd-browse-remove").click()
    page.locator("#remove-confirm").click()
    a_rows.wait_for(state="detached")
    assert page.evaluate("DJEngine.snapshot().A.track.title") == "Imported Track"
    assert page.evaluate("DJStorage.list().then(rows => rows.length)") == 0
    assert a.locator(".dd-browse-filter").input_value() == "imports"
    assert page.locator("#deck-a [role=option]").count() == 0
    assert page.locator("#deck-a .dd-browse-load").is_disabled()
    page.keyboard.press("Escape")

    page.locator("#settings-open").click()
    page.locator("#midi-open").click()
    assert page.locator("dialog[open]").count() == 2
    page.keyboard.press("Escape")
    page.keyboard.press("Escape")
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
        open_full_studio(browsing)
        check_deck_browser(browsing)
        browsing.close()
        check_touch_browser(browser, url)
        check_file_drops(browser, url)
        browser.close()
    print("Playback, recording, imports, downloads, independent deck playlists, MIDI and responsive layout passed.")
