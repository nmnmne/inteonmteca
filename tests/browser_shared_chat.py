"""Two isolated browser clients against a local API, with no external mail or posts."""
import json
import os
import re
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
with patch.object(Path, "exists", return_value=False):
    from server.app import Store, make_handler


def exercise(browser, url):
    contexts = [browser.new_context(viewport={"width": 1440, "height": 900}),
                browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)]
    errors = []
    try:
        for context in contexts:
            context.route("https://**/*", lambda route: route.abort())
            context.add_init_script("localStorage.setItem('inteonmteca-local-session','stale@example.test');localStorage.setItem('inteonmteca-local-chat',JSON.stringify([{text:'private old history'}]));")
        pages = [c.new_page() for c in contexts]
        for page in pages:
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(url, wait_until="domcontentloaded")
            expect(page.locator("#auth-hint")).to_have_text("вход")
            assert "private old history" not in page.locator("#chat-stream").inner_text()
        # Mobile chat is behind the existing section slider.
        pages[1].locator("#mobile-section-slider").focus()
        pages[1].keyboard.press("End")
        for index, page in enumerate(pages):
            page.locator("#auth-hint").click()
            page.locator("#auth-email").fill(f"client{index}@example.test")
            page.locator("#auth-email-form button").click()
            expect(page.locator("#auth-status")).to_contain_text(re.compile(r"код входа: \d{6}"))
            code = re.search(r"\d{6}", page.locator("#auth-status").text_content()).group()
            page.locator("#auth-code").fill(code)
            page.locator("#auth-code-form button").click()
            page.wait_for_function("!document.querySelector('#chat-input').readOnly")
            page.locator("#chat-input").fill(f"client {index} hello")
            page.locator("#chat-input").press("Enter")
            for peer in pages:
                expect(peer.locator("#chat-stream")).to_contain_text(f"client {index} hello", timeout=15000)
        for page in pages:
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#chat-stream")).to_contain_text("client 0 hello")
            expect(page.locator("#chat-stream")).to_contain_text("client 1 hello")
            assert page.evaluate("localStorage.getItem('inteonmteca-local-chat').includes('private old history')")
        # Outage never becomes a fake local write; keep the user's unsent draft.
        pages[0].route("**/api/chat", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"offline"}'))
        pages[0].locator("#chat-input").fill("unsent draft")
        pages[0].locator("#chat-input").press("Enter")
        expect(pages[0].locator("#chat-status")).to_have_text("offline")
        expect(pages[0].locator("#chat-input")).to_have_value("unsent draft")
        assert "unsent draft" not in pages[0].locator("#chat-stream").inner_text()
        assert not errors, errors
        return {"two_way_messages": True, "reload_persistence": True, "legacy_preserved": True,
                "failed_send_preserves_draft": True, "page_errors": errors}
    finally:
        for context in contexts:
            context.close()


def main():
    with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"INTEONMTECA_QUIET": "1"}):
        store = Store(Path(directory) / "chat.db")
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(ROOT, store, None, force_dev_code=True))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(channel="msedge", headless=True)
                result = exercise(browser, f"http://127.0.0.1:{server.server_port}/")
                browser.close()
                print(json.dumps(result))
        finally:
            server.shutdown()
            server.server_close()
            store.close()


if __name__ == "__main__":
    main()
