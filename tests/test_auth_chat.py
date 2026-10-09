from http.cookiejar import CookieJar
from contextlib import closing
from pathlib import Path
import json
import sqlite3
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib import request
from urllib.error import HTTPError

from unittest.mock import patch

# Never load workstation dotenv files when importing the backend in tests.
with patch.object(Path, "exists", return_value=False):
    from server.app import Store, make_handler


class AuthChatServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        (root / "media" / "Night").mkdir(parents=True)
        (root / "assets").mkdir()
        (root / "media" / "Night" / "Sonyx - Light Of The Night.flac").write_bytes(b"audio")
        (root / "index.html").write_text("<html></html>", encoding="utf-8")
        cls.store = Store(root / "app.db")
        handler = make_handler(root, cls.store, smtp=None, force_dev_code=True)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.store.close()
        cls.tmp.cleanup()

    def setUp(self):
        self.cookies = CookieJar()
        self.opener = request.build_opener(request.HTTPCookieProcessor(self.cookies))

    def _json(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        req = request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with self.opener.open(req) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def test_playlist_is_scanned_from_media(self):
        status, body = self._json("GET", "/api/playlist")
        self.assertEqual(status, 200)
        self.assertEqual(body[0]["title"], "Light Of The Night")
        self.assertEqual(body[0]["artist"], "Sonyx")

    def test_email_code_creates_account_and_unlocks_chat(self):
        status, body = self._json("POST", "/api/auth/request-code", {"email": "matt@example.com"})
        self.assertEqual(status, 200)
        self.assertTrue(self.store.user_exists("matt@example.com"))
        code = body.get("login_code") or body.get("dev_code")
        status, body = self._json("POST", "/api/auth/verify", {"email": "matt@example.com", "code": code})
        self.assertEqual(status, 200)
        self.assertEqual(body["email"], "matt@example.com")
        status, me = self._json("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(me["email"], "matt@example.com")
        status, _ = self._json("POST", "/api/chat", {"text": "висит в воздухе"})
        self.assertEqual(status, 200)
        status, chat = self._json("GET", "/api/chat")
        self.assertEqual(status, 200)
        self.assertEqual(chat["messages"][-1]["text"], "висит в воздухе")

    def test_chat_is_rejected_without_a_session(self):
        status, body = self._json("POST", "/api/chat", {"text": "нет"})
        self.assertEqual(status, 401)
        self.assertIn("войди", body["error"])

    def test_chat_history_stays_and_is_visible_without_login(self):
        status, body = self._json("POST", "/api/auth/request-code", {"email": "keep@example.com"})
        self.assertEqual(status, 200)
        code = body.get("login_code") or body.get("dev_code")
        status, _ = self._json("POST", "/api/auth/verify", {"email": "keep@example.com", "code": code})
        self.assertEqual(status, 200)
        for text in ("первый след", "второй след"):
            status, _ = self._json("POST", "/api/chat", {"text": text})
            self.assertEqual(status, 200)
        public = request.build_opener()
        with public.open(self.base + "/api/chat") as response:
            chat = json.loads(response.read().decode("utf-8"))
        texts = [item["text"] for item in chat["messages"]]
        self.assertIn("первый след", texts)
        self.assertIn("второй след", texts)

    def test_invalid_email_is_rejected(self):
        status, body = self._json("POST", "/api/auth/request-code", {"email": "not-mail"})
        self.assertEqual(status, 400)
        self.assertIn("почта", body["error"])


class ChatRetentionTests(unittest.TestCase):
    def test_insertion_deletes_old_messages_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "chat.db"
            store = Store(db_path)
            for index in range(75):
                store.add_message("reader@example.test", f"message {index}")
            store.close()
            with closing(sqlite3.connect(db_path)) as connection:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 50)
            store = Store(db_path)
            try:
                self.assertEqual([item["text"] for item in store.messages()], [f"message {index}" for index in range(25, 75)])
                self.assertEqual(store.messages(0), [])
                self.assertEqual(len(store.messages(5)), 5)
            finally:
                store.close()

    def test_startup_trims_history_from_an_existing_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "old-chat.db"
            store = Store(db_path)
            store.close()
            with closing(sqlite3.connect(db_path)) as connection:
                connection.executemany(
                    "INSERT INTO messages(email, text, created_at) VALUES(?, ?, ?)",
                    [("old@example.test", str(index), index) for index in range(120)],
                )
                connection.commit()
            store = Store(db_path)
            try:
                self.assertEqual([item["text"] for item in store.messages()], [str(index) for index in range(70, 120)])
                with closing(sqlite3.connect(db_path)) as connection:
                    self.assertEqual(connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 50)
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
