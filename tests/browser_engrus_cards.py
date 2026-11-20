"""Exercise the courtyard Eng-Rus window and its slideshow through the public controls."""
import sys
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def check(browser, url, width, height, touch):
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch, has_touch=touch,
                            reduced_motion="reduce")
    page.goto(url, wait_until="domcontentloaded")
    page.locator('[data-app="dj"][data-window-action="close"]:visible').click()
    launcher = page.locator('[data-launch="engrus"]')
    page.clock.install()
    launcher.click()
    cards = page.locator(".engrus-cards")
    count = cards.locator(".engrus-count")
    english = cards.locator(".engrus-english")
    russian = cards.locator(".engrus-russian")
    assert count.text_content() == "1 / 48" and english.text_content() == "Nice to meet you."
    assert russian.is_hidden()
    page.clock.fast_forward(1400)
    page.locator('[data-app="engrus"][data-window-action="minimize"]').click()
    page.clock.fast_forward(9000)
    page.get_by_role("button", name="Развернуть Eng-Rus").click()
    assert count.text_content() == "1 / 48" and russian.is_hidden()
    page.clock.fast_forward(2200)
    assert russian.is_visible() and russian.text_content() == "Приятно познакомиться."
    page.clock.fast_forward(3300)
    assert count.text_content() == "2 / 48" and russian.is_hidden()

    cards.get_by_role("button", name="Пауза").click()
    page.clock.fast_forward(9000)
    assert count.text_content() == "2 / 48" and russian.is_hidden()
    cards.get_by_role("button", name="Показать перевод").click()
    assert russian.is_visible() and russian.text_content() == "Звучит неплохо."
    cards.get_by_role("button", name="Предыдущая карточка").click()
    cards.get_by_role("button", name="Предыдущая карточка").click()
    assert count.text_content() == "48 / 48" and english.text_content() == "See you around."
    cards.get_by_role("button", name="Следующая карточка").click()
    assert count.text_content() == "1 / 48" and russian.is_hidden()
    cards.get_by_role("button", name="Продолжить").click()
    page.clock.fast_forward(1000)
    # Headless Chromium keeps every tab visible. Deliver the same visibility event and state explicitly.
    page.evaluate("""() => {
        Object.defineProperty(document, 'hidden', {configurable: true, value: true});
        document.dispatchEvent(new Event('visibilitychange'));
    }""")
    page.clock.fast_forward(8000)
    assert count.text_content() == "1 / 48" and russian.is_hidden()
    page.evaluate("() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }")
    page.clock.fast_forward(2600)
    assert russian.is_visible()
    assert cards.evaluate("el => el.scrollWidth <= el.clientWidth")
    page.locator('[data-app="engrus"][data-window-action="close"]').click()
    assert cards.is_hidden()
    page.close()


if __name__ == "__main__":
    address = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/"
    if urlsplit(address).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Pass a local studio preview URL.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        for viewport in ((1440, 900, False), (320, 640, True)):
            check(browser, address, *viewport)
        browser.close()
    print("Eng-Rus opens, reveals, advances, pauses, wraps and resumes on desktop and touch.")
