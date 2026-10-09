"""Shared guest history, authenticated posting and panel behavior with an isolated DB.

No external mail, counters or chat servers are contacted.
Run: python tests/browser_chat_auth.py
"""
from pathlib import Path
import json
import os
import re
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
with patch.object(Path, "exists", return_value=False):
    from server.app import COOKIE_NAME, Store, make_handler


def main():
    with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"INTEONMTECA_QUIET": "1"}):
        store = Store(Path(tmp) / "chat.db")
        for index in range(55):
            store.add_message("fixture@example.test", f"shared fixture {index}")
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(ROOT, store, smtp=None, force_dev_code=True))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        errors = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(channel="msedge", headless=True)

                def context(**kwargs):
                    ctx = browser.new_context(**kwargs)
                    ctx.route("https://**/*", lambda route: route.abort())
                    ctx.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
                    return ctx

                guest_context = context(viewport={"width": 1440, "height": 900})
                guest = guest_context.new_page()
                guest.goto(url, wait_until="domcontentloaded")
                guest.wait_for_function("document.querySelectorAll('#chat-stream .chat-line').length === 50")
                assert guest.locator(".chat-text").first.text_content() == "shared fixture 5"
                assert guest.locator("#chat-input").get_attribute("readonly") is not None
                guest.evaluate("window.retainedChatRow = document.querySelectorAll('#chat-stream .chat-line')[1]")

                for width, height in ((1440, 900), (390, 844), (320, 568)):
                    guest.set_viewport_size({"width": width, "height": height})
                    guest.locator("#theme-hint").click()
                    assert guest.locator("#theme-panel").is_visible()
                    guest.locator("#auth-hint").click()
                    assert guest.locator("#theme-panel").is_hidden()
                    assert guest.locator("#auth-panel").is_visible()
                    guest.locator("#auth-hint").click()
                    assert guest.locator("#auth-panel").is_hidden()
                    guest.locator("#auth-hint").click()
                    guest.locator("#theme-hint").click()
                    assert guest.locator("#auth-panel").is_hidden()
                    guest.keyboard.press("Escape")
                    assert guest.locator("#theme-panel").is_hidden()
                    guest.locator("#auth-hint").click()
                    guest.locator("#auth-close").click()
                    assert guest.locator("#auth-panel").is_hidden()
                guest.set_viewport_size({"width": 1440, "height": 900})

                author_context = context(viewport={"width": 1440, "height": 900})
                author = author_context.new_page()
                author.goto(url, wait_until="domcontentloaded")
                author.wait_for_function("document.querySelectorAll('#chat-stream .chat-line').length === 50")
                author.locator("#auth-hint").click()
                author.locator("#auth-email").fill("author@example.test")
                author.locator("#auth-email-form button").click()
                author.wait_for_function("/код входа: \\d{6}/.test(document.querySelector('#auth-status').textContent)")
                code = re.search(r"\d{6}", author.locator("#auth-status").text_content()).group()
                author.locator("#auth-code").fill(code)
                author.locator("#auth-code-form button").click()
                author.wait_for_function("!document.querySelector('#chat-input').readOnly")
                author.locator("#chat-input").fill("shared live message")
                author.locator("#chat-form button").click()
                author.wait_for_function("document.querySelector('#chat-stream').textContent.includes('shared live message')")
                guest.wait_for_function("document.querySelector('#chat-stream').textContent.includes('shared live message')")
                assert guest.locator("#chat-stream .chat-line").count() == 50
                assert guest.evaluate("window.retainedChatRow === document.querySelector('#chat-stream .chat-line')")
                assert len(store.messages()) == 50

                # A rejected write keeps the shared history and draft, then asks for login.
                session = next(cookie["value"] for cookie in author_context.cookies() if cookie["name"] == COOKIE_NAME)
                store.drop_session(session)
                author.locator("#chat-input").fill("unsent draft")
                author.locator("#chat-form button").click()
                author.wait_for_function("!document.querySelector('#auth-panel').hidden && document.querySelector('#chat-input').readOnly")
                assert author.locator("#chat-input").input_value() == "unsent draft"
                assert author.locator("#chat-stream .chat-line").count() == 50
                assert "unsent draft" not in [message["text"] for message in store.messages()]

                # Static HTTP hosting cannot silently become a per-browser account/chat.
                static_context = context(viewport={"width": 1440, "height": 900})
                static_context.add_init_script("try { localStorage.setItem('inteonmteca-local-session','stale@example.test'); localStorage.setItem('inteonmteca-local-chat',JSON.stringify([{text:'private fake message'}])); } catch {}")
                static_context.route("**/api/**", lambda route: route.fulfill(status=404, content_type="text/html", body="no backend"))
                static_page = static_context.new_page()
                static_page.goto(url, wait_until="domcontentloaded")
                static_page.wait_for_function("!document.querySelector('#chat-status').hidden")
                assert static_page.locator("#auth-hint").text_content() == "вход"
                assert static_page.locator("#chat-stream .chat-line").count() == 0
                static_page.locator("#auth-hint").click()
                static_page.locator("#auth-email").fill("static@example.test")
                static_page.locator("#auth-email-form button").click()
                static_page.wait_for_function("document.querySelector('#auth-status').textContent.includes('не подключён')")
                assert static_page.locator("#auth-code-form").is_hidden()
                assert static_page.locator("#chat-input").get_attribute("readonly") is not None
                assert not errors, errors
                browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            store.close()
        print(json.dumps({"ok": True, "history": 50, "viewports": [1440, 390, 320], "shared_guest_read": True, "authenticated_write": True, "http_fallback_disabled": True, "page_errors": errors}))


if __name__ == "__main__":
    main()
