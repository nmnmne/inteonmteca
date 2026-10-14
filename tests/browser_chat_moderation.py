"""Real frontend + cloud handler, isolated memory DB and intercepted email."""
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from test_cloud_chat import MemoryStore
from server.cloud import index as api


def main():
    store, mail = MemoryStore(), []
    mid = "a" * 24
    store.put("messages", [{"id": mid, "email": "other", "text": "Message to moderate", "created_at": 1}])
    class Static(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), Static)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def route_api(route):
        request = route.request
        event = {"httpMethod": request.method, "path": request.url.split(str(server.server_port), 1)[1],
                 "headers": request.all_headers(), "body": request.post_data or "",
                 "requestContext": {"identity": {"sourceIp": "test"}}}
        event["headers"]["origin"] = api.ORIGIN
        result = api.handle(event, None, store, lambda email, code, _: mail.append(code))
        headers = result["headers"]
        if "Set-Cookie" in headers:
            headers["Set-Cookie"] = headers["Set-Cookie"].replace("; Secure", "")
        route.fulfill(status=result["statusCode"], headers=headers, body=result["body"])
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.route("https://**/*", lambda route: route.abort())
            context.route("**/api/**", route_api)
            page, guest = context.new_page(), context.new_page()
            url = f"http://127.0.0.1:{server.server_port}/"
            guest.goto(url, wait_until="domcontentloaded")
            row = guest.locator(".chat-line").filter(has_text="Message to moderate")
            row.dblclick()
            expect(guest.locator("#chat-delete-dialog")).not_to_be_visible()
            page.goto(url, wait_until="domcontentloaded")
            page.locator("#auth-hint").click()
            page.locator("#auth-email").fill(api.MODERATOR_EMAIL)
            page.locator("#auth-email-form button").click()
            expect(page.locator("#auth-status")).to_contain_text("Для удаления")
            page.locator("#auth-code").fill(mail[-1])
            page.locator("#auth-code-form button").click()
            expect(page.locator("#chat-stream")).to_have_class("chat-stream can-moderate")
            row = page.locator(".chat-line").filter(has_text="Message to moderate")
            row.dblclick()
            expect(page.locator("#chat-delete-question")).to_have_text("Вы уверены, что хотите удалить сообщение?")
            page.locator("#chat-delete-no").click()
            expect(row).to_have_count(1)
            assert len(store.get("messages")) == 1
            row.dblclick()
            page.locator("#chat-delete-yes").click()
            expect(row).to_have_count(0)
            expect(guest.locator(".chat-line")).to_have_count(0, timeout=10000)
            assert store.get("deleted:" + mid)
            browser.close()
            print(json.dumps({"mail_only_moderator": True, "double_click": True, "cancel_preserves": True,
                              "confirm_deletes_for_everyone": True}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
