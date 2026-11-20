"""Verify the listening room's real transport across entry, navigation and local midnight."""
import json
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright


MEMPHIS = "media/Memphis/Матт - Memphis.flac"
OTHER = "media/Deadsouls/Матт - Deadsouls.flac"


def expect_track(page, audio, paused):
    page.wait_for_function("""([path, paused]) => {
        const player = document.querySelector('#album-player');
        const saved = window.inteonPlayback?.read();
        const src = window.DJ_LOUDNESS?.[path]?.src || path;
        return player.readyState >= 1 && player.paused === paused
            && saved?.audio === path && saved.paused === paused
            && player.currentSrc === new URL(src, document.baseURI).href;
    }""", arg=[audio, paused])


def check(browser, base):
    with browser.new_context(timezone_id="Asia/Tokyo", reduced_motion="reduce",
                             viewport={"width": 390, "height": 844}) as context:
        page = context.new_page()
        page.route("https://**/*", lambda route: route.abort())
        page.clock.install(time=datetime.fromisoformat("2026-11-20T14:59:30+00:00"))
        stale = json.dumps({"audio": OTHER, "paused": False, "playingIntent": True, "time": 19})
        page.add_init_script(f"""if (!localStorage.getItem('inteonmteca-playback'))
            localStorage.setItem('inteonmteca-playback', JSON.stringify({stale}));""")
        page.goto(base + "listening-room.html")
        expect_track(page, MEMPHIS, True)
        assert page.locator("#now-playing-title").get_attribute("data-track") == "Memphis"
        assert page.locator("#track-list .track-item").first.get_attribute("data-track-title") == "Memphis"
        assert page.locator("body.is-inline-playing, .track-flight, #immersive-mode.is-active").count() == 0
        assert page.evaluate("document.querySelector('#album-player').currentTime") == 0
        page.locator("#immersive-play").click()
        expect_track(page, MEMPHIS, False)
        assert page.locator("body.is-inline-playing").count() == 1

        def play_other():
            page.get_by_role("button", name="Воспроизвести Deadsouls", exact=True).first.press("Enter")
            expect_track(page, OTHER, False)

        play_other()
        page.evaluate("document.querySelector('#album-player').currentTime = 17")
        with page.expect_navigation():
            page.evaluate("location.assign('listening-room.html?continue')")
        expect_track(page, OTHER, False)
        assert page.evaluate("document.querySelector('#album-player').currentTime") >= 16

        # Tokyo crosses midnight nine hours before UTC.
        page.clock.fast_forward(35_000)
        expect_track(page, OTHER, False)
        page.locator("#immersive-play").click()
        expect_track(page, MEMPHIS, True)

        play_other()
        page.locator("#immersive-play").click()
        expect_track(page, OTHER, True)
        # A tab waking on a later date must update even if its timer was suspended.
        page.clock.set_system_time(datetime.fromisoformat("2026-11-21T15:01:00+00:00"))
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect_track(page, MEMPHIS, True)

        play_other()
        page.clock.set_system_time(datetime.fromisoformat("2026-11-22T15:01:00+00:00"))
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect_track(page, OTHER, False)
        page.evaluate("""() => {
            const player = document.querySelector('#album-player');
            player.currentTime = player.duration - 0.25;
        }""")
        expect_track(page, MEMPHIS, True)

        play_other()
        page.locator("#immersive-play").click()
        expect_track(page, OTHER, True)
        page.reload()
        expect_track(page, MEMPHIS, True)
        print("Fresh entry, active handoff, local midnight, wake, EOF and paused reload passed.", flush=True)


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8122/"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True,
                                             args=["--autoplay-policy=no-user-gesture-required"])
        check(browser, url.rstrip("/") + "/")
        browser.close()
