"""Exercise the opening track at entry, at local midnight, and after a sleeping tab wakes."""
import os
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright


BASE = os.environ.get("INTEON_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
MEMPHIS = "media/Memphis/Матт - Memphis.flac"


def verify(browser, zone, utc_midnight_hour):
    page = browser.new_page(timezone_id=zone, reduced_motion="reduce")
    midnight = datetime(2026, 12, 7, utc_midnight_hour, tzinfo=timezone.utc)
    page.clock.install(time=datetime.fromtimestamp(midnight.timestamp() - 3600, tz=timezone.utc))
    page.goto(BASE, wait_until="domcontentloaded")
    compact = page.locator("#yard-dj-compact")
    compact.wait_for()
    assert page.evaluate("DJEngine.snapshot().A.track.id") == MEMPHIS
    assert page.evaluate("DJStudioLibrary.list()[0].id") == MEMPHIS
    assert page.evaluate("DJEngine.snapshot().B.track.title") == "Виртуальная реальность"
    page.evaluate("DJEngine.setCross(-.25); DJEngine.setFilter('B', .5)")
    compact.locator(".compact-next").click()
    page.wait_for_function("id => DJEngine.snapshot().A.track.id !== id", arg=MEMPHIS)
    page.clock.set_system_time(datetime.fromtimestamp(midnight.timestamp() - 2, tz=timezone.utc))
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    assert page.evaluate("new Date().getHours()") == 23
    page.clock.fast_forward(2450)
    page.wait_for_function("id => DJEngine.snapshot().A.track.id === id", arg=MEMPHIS)
    assert page.evaluate("DJEngine.snapshot().cross === -.25 && DJEngine.snapshot().B.filter === .5")
    version = page.evaluate("DJEngine.snapshot().A.loadVersion")
    page.evaluate("window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus'))")
    assert page.evaluate("DJEngine.snapshot().A.loadVersion") == version
    compact.locator(".compact-next").click()
    page.wait_for_function("id => DJEngine.snapshot().A.track.id !== id", arg=MEMPHIS)
    compact.locator(".compact-play").click()
    page.wait_for_function("DJEngine.snapshot().A.playing && DJEngine.snapshot().A.time > .2")
    version = page.evaluate("DJEngine.snapshot().A.loadVersion")
    page.clock.set_system_time(datetime.fromtimestamp(midnight.timestamp() + 3 * 86400 + 300, tz=timezone.utc))
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    assert page.evaluate("v => DJEngine.snapshot().A.playing && DJEngine.snapshot().A.loadVersion === v", version)
    compact.locator(".compact-play").click()
    page.wait_for_function("id => !DJEngine.snapshot().A.playing && DJEngine.snapshot().A.track.id === id", arg=MEMPHIS)
    compact.locator(".compact-next").click()
    page.wait_for_function("id => DJEngine.snapshot().A.track.id !== id", arg=MEMPHIS)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("id => DJEngine.snapshot().A.track.id === id", arg=MEMPHIS)
    print(zone, "entry, midnight, active mix, wake and revisit passed", flush=True)
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        verify(browser, "Asia/Oral", 19)
        verify(browser, "America/New_York", 5)
        browser.close()
