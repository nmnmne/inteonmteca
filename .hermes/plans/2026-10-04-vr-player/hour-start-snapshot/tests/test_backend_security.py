"""HTTP regressions using only temporary fixtures, never deployment secrets."""
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

with patch.object(Path, "exists", return_value=False):
    from server import app


class BackendSecurityTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"INTEONMTECA_QUIET": "1"}, clear=True)
        self.env.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "media").mkdir()
        (self.root / "media" / "song.flac").write_bytes(b"0123456789")
        (self.root / ".git").mkdir()
        (self.root / ".git" / "config").write_text("fixture-private")
        (self.root / "index.html").write_text("public")
        self.store = app.Store(self.root / "fixture.db")
        self.server = None

    def start(self, **kwargs):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), app.make_handler(self.root, self.store, **kwargs))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.thread.join()
        self.store.close()
        self.tmp.cleanup()
        self.env.stop()

    def request(self, method, path, payload=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        body = json.dumps(payload).encode() if payload is not None else None
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = (response.status, dict(response.getheaders()), response.read())
        connection.close()
        return result

    def test_forwarded_ip_requires_explicit_trusted_peer(self):
        from email.message import Message
        handler = object.__new__(app.make_handler(self.root, self.store, smtp=None))
        handler.client_address = ("127.0.0.1", 1234)
        handler.headers = Message()
        handler.headers["X-Forwarded-For"] = "192.0.2.99, 198.51.100.5"
        self.assertEqual(handler._client(), "127.0.0.1")
        os.environ["INTEONMTECA_TRUSTED_PROXIES"] = "127.0.0.1"
        self.assertEqual(handler._client(), "198.51.100.5")
        os.environ["INTEONMTECA_TRUSTED_PROXIES"] = "127.0.0.1,198.51.100.5"
        self.assertEqual(handler._client(), "192.0.2.99")
        handler.headers.replace_header("X-Forwarded-For", "not-an-ip")
        self.assertEqual(handler._client(), "127.0.0.1")

    def test_invalid_body_framing_is_rejected(self):
        self.start(smtp=None)
        for headers in ({"Content-Length": "-1"}, {"Content-Length": "invalid"}, {"Transfer-Encoding": "chunked"}):
            status, _, body = self.request("POST", "/api/auth/request-code", headers=headers)
            self.assertEqual(status, 400)
            self.assertIn("error", json.loads(body))

    def test_explicit_dev_mode_keeps_local_login_available(self):
        os.environ["INTEONMTECA_DIRECT_CODE"] = "0"
        self.start(smtp=None, force_dev_code=True)
        status, _, body = self.request("POST", "/api/auth/request-code", {"email": "dev@example.com"})
        self.assertEqual(status, 200)
        code = json.loads(body)["login_code"]
        status, headers, _ = self.request("POST", "/api/auth/verify", {"email": "dev@example.com", "code": code})
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        status, _, _ = self.request("POST", "/api/auth/verify", {"email": "dev@example.com", "code": code})
        self.assertEqual(status, 401)

    def test_private_files_are_blocked_for_head_and_case_variants(self):
        self.start(smtp=None)
        for method, path in (("HEAD", "/.git/config"), ("GET", "/.GIT/config"), ("GET", "/media/../.GIT/config")):
            with self.subTest(method=method, path=path):
                status, _, _ = self.request(method, path, headers={"Range": "bytes=0-4"})
                self.assertEqual(status, 404)

    def test_history_returns_only_latest_100_in_chronological_order(self):
        self.start(smtp=None)
        for index in range(105):
            self.store.add_message("history@example.com", str(index))
        status, _, body = self.request("GET", "/api/chat")
        messages = json.loads(body)["messages"]
        self.assertEqual(status, 200)
        self.assertEqual([item["text"] for item in messages], [str(index) for index in range(5, 105)])
        for limit in (None, -1, 100000):
            self.assertEqual(len(self.store.messages(limit)), 100)
        token = self.store.create_session("history@example.com")
        status, _, body = self.request("POST", "/api/chat", {"text": "latest"}, {"Cookie": f"{app.COOKIE_NAME}={token}"})
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)["messages"]), 100)
        self.assertEqual(json.loads(body)["messages"][-1]["text"], "latest")

    def test_chat_posting_is_limited_per_account_and_ip(self):
        self.start(smtp=None)
        token = self.store.create_session("poster@example.com")
        cookie = {"Cookie": f"{app.COOKIE_NAME}={token}"}
        for index in range(10):
            status, _, _ = self.request("POST", "/api/chat", {"text": f"message {index}"}, cookie)
            self.assertEqual(status, 200)
        status, _, _ = self.request("POST", "/api/chat", {"text": "blocked"}, cookie)
        self.assertEqual(status, 429)
        for index in range(30):
            token = self.store.create_session(f"poster{index}@example.com")
            self.request("POST", "/api/chat", {"text": "other account"}, {"Cookie": f"{app.COOKIE_NAME}={token}", "X-Forwarded-For": f"192.0.2.{index}"})
        token = self.store.create_session("last@example.com")
        status, _, _ = self.request("POST", "/api/chat", {"text": "blocked by IP"}, {"Cookie": f"{app.COOKIE_NAME}={token}"})
        self.assertEqual(status, 429)
        self.assertNotIn("blocked", [item["text"] for item in self.store.messages()])

    def test_verify_attempts_are_limited_per_email_and_ip_despite_spoofed_xff(self):
        self.start(smtp=None)
        self.store.save_code("target@example.com", "123456")
        for index in range(5):
            status, _, _ = self.request("POST", "/api/auth/verify", {"email": "target@example.com", "code": "000000"}, {"X-Forwarded-For": f"192.0.2.{index}"})
            self.assertEqual(status, 401)
        status, _, _ = self.request("POST", "/api/auth/verify", {"email": "target@example.com", "code": "123456"})
        self.assertEqual(status, 429)
        for index in range(30):
            self.request("POST", "/api/auth/verify", {"email": f"other{index}@example.com", "code": "000000"}, {"X-Forwarded-For": f"198.51.100.{index}"})
        status, _, _ = self.request("POST", "/api/auth/verify", {"email": "new@example.com", "code": "000000"}, {"X-Forwarded-For": "203.0.113.9"})
        self.assertEqual(status, 429)

    def test_request_body_is_bounded(self):
        self.start(smtp=None, force_dev_code=True)
        # Headers alone must trigger rejection, without reading/allocating the body.
        # Sending a full rejected body races TCP close on Windows (unread-data RST).
        status, _, body = self.request("POST", "/api/auth/request-code", headers={"Content-Length": "65537"})
        self.assertEqual(status, 413)
        self.assertIn("error", json.loads(body))
        self.assertFalse(self.store.user_exists("large@example.com"))

    def test_arbitrary_origins_receive_no_credentialed_cors(self):
        self.start(smtp=None)
        for method in ("GET", "OPTIONS"):
            status, headers, _ = self.request(method, "/api/chat", headers={"Origin": "https://attacker.invalid"})
            self.assertIn(status, (200, 204))
            self.assertNotIn("Access-Control-Allow-Origin", headers)
            self.assertNotIn("Access-Control-Allow-Credentials", headers)

    def test_auth_fails_closed_without_smtp_unless_demo_is_explicit(self):
        self.start(smtp=None)
        for value in (None, "0", "false"):
            if value is None:
                os.environ.pop("INTEONMTECA_DIRECT_CODE", None)
            else:
                os.environ["INTEONMTECA_DIRECT_CODE"] = value
            status, _, body = self.request("POST", "/api/auth/request-code", {"email": "closed@example.com"})
            self.assertEqual(status, 503)
            self.assertNotIn("login_code", json.loads(body))
            self.assertFalse(self.store.user_exists("closed@example.com"))
        os.environ["INTEONMTECA_DIRECT_CODE"] = "1"
        status, _, body = self.request("POST", "/api/auth/request-code", {"email": "demo@example.com"})
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)["login_code"]), 6)

    def test_smtp_default_sends_code_without_exposing_it(self):
        self.start(smtp={"host": "fixture.invalid"})
        with patch.object(app, "send_login_email") as send:
            status, _, body = self.request("POST", "/api/auth/request-code", {"email": "mail@example.com"})
        self.assertEqual(status, 200)
        self.assertNotIn("login_code", json.loads(body))
        send.assert_called_once()
        code = send.call_args.args[2]
        self.assertTrue(self.store.check_code("mail@example.com", code))

    def test_range_cannot_escape_media_or_bypass_private_file_rules(self):
        self.start(smtp=None)
        for path in ("/media/../.git/config", "/media/%2e%2e/.git/config", "/media/../index.html", "/media/../fixture.db"):
            with self.subTest(path=path):
                status, _, body = self.request("GET", path, headers={"Range": "bytes=0-4"})
                self.assertEqual(status, 404)
                self.assertNotIn(b"fixture-private", body)
        status, headers, body = self.request("GET", "/media/song.flac", headers={"Range": "bytes=2-5"})
        self.assertEqual((status, headers["Content-Range"], body), (206, "bytes 2-5/10", b"2345"))
