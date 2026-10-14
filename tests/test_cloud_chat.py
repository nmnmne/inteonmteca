"""Guest API contract and transactional behavior, without cloud or mail calls."""
import copy
import json
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from server.cloud import index as api


class MemoryStore:
    def __init__(self):
        self.data = {}
        self.lock = threading.Lock()

    def transact(self, action):
        with self.lock:
            snapshot = copy.deepcopy(self.data)
            try:
                return action(self)
            except Exception:
                self.data = snapshot
                raise

    def get(self, key, default=None):
        value, expires = self.data.get(key, (default, None))
        return copy.deepcopy(value if not expires or expires > time.time() else default)

    def put(self, key, value, expires_at=None):
        self.data[key] = (copy.deepcopy(value), expires_at)

    def delete(self, key):
        self.data.pop(key, None)


class CloudChatTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.mail = []

    def request(self, method, path, body=None, cookie="", origin=api.ORIGIN, ip="192.0.2.1", mailer=None):
        result = api.handle({"httpMethod": method, "path": path,
                             "headers": {"origin": origin, "content-type": "application/json", "cookie": cookie},
                             "requestContext": {"identity": {"sourceIp": ip}},
                             "body": json.dumps(body) if body is not None else ""}, None, self.store,
                            mailer or (lambda email, code, _: self.mail.append((email, code))))
        return result["statusCode"], json.loads(result["body"]), result["headers"]

    def login(self, email="guest@example.test", ip="192.0.2.1"):
        status, code, _ = self.request("POST", "/api/auth/request-code", {"email": email}, ip=ip)
        self.assertEqual(status, 200)
        status, _, headers = self.request("POST", "/api/auth/verify", {
            "email": email, "code": code["login_code"], "challenge": code["challenge"]}, ip=ip)
        self.assertEqual(status, 200)
        return headers["Set-Cookie"].split(";", 1)[0]

    def test_shared_history_across_independent_clients_and_logout(self):
        cookie = self.login()
        status, body, _ = self.request("POST", "/api/chat", {"text": "Общее сообщение"}, cookie)
        self.assertEqual(status, 200)
        self.assertEqual(self.request("GET", "/api/chat")[1]["messages"], body["messages"])
        self.assertEqual(body["message"]["email"], "guest")
        self.assertNotIn("@", json.dumps(body))
        self.assertEqual(self.request("GET", "/api/auth/me", cookie=cookie)[0], 200)
        self.request("POST", "/api/auth/logout", {}, cookie)
        self.assertEqual(self.request("POST", "/api/chat", {"text": "нет"}, cookie)[0], 401)
        self.assertEqual(len(self.request("GET", "/api/chat")[1]["messages"]), 1)

    def test_identical_screen_and_email_code_and_silent_mail_failure(self):
        _, body, _ = self.request("POST", "/api/auth/request-code", {"email": "first@example.test"})
        self.assertEqual(self.mail, [("first@example.test", body["login_code"])])
        def broken(*args):
            raise TimeoutError("private provider failure")
        status, body, _ = self.request("POST", "/api/auth/request-code", {"email": "second@example.test"}, mailer=broken)
        self.assertEqual(status, 200)
        self.assertNotIn("error", body)
        self.assertEqual(self.request("POST", "/api/auth/verify", {
            "email": "second@example.test", "code": body["login_code"], "challenge": body["challenge"]})[0], 200)

    def test_one_use_challenges_are_independent_even_for_same_email(self):
        email = "same@example.test"
        codes = [self.request("POST", "/api/auth/request-code", {"email": email})[1] for _ in range(2)]
        for value in codes:
            request = {"email": email, "code": value["login_code"], "challenge": value["challenge"]}
            self.assertEqual(self.request("POST", "/api/auth/verify", request)[0], 200)
            self.assertEqual(self.request("POST", "/api/auth/verify", request)[0], 401)

    def test_concurrent_posts_are_not_lost_and_history_is_bounded(self):
        clients = [(self.login(f"guest{i}@example.test", ip=f"192.0.2.{i+10}"), f"192.0.2.{i+10}") for i in range(6)]
        def send(index):
            cookie, ip = clients[index % len(clients)]
            return self.request("POST", "/api/chat", {"text": f"message {index}"}, cookie, ip=ip)[0]
        with ThreadPoolExecutor(max_workers=6) as pool:
            self.assertEqual(list(pool.map(send, range(60))), [200] * 60)
        messages = self.request("GET", "/api/chat")[1]["messages"]
        self.assertEqual(len(messages), 50)
        self.assertEqual(len({m["id"] for m in messages}), 50)

    def test_limits_cors_expiry_and_private_cookie(self):
        cookie = self.login()
        status, _, headers = self.request("GET", "/api/chat", origin="https://other.invalid")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(self.request("POST", "/api/chat", {"text": "x" * 281}, cookie)[0], 400)
        for i in range(10):
            self.assertEqual(self.request("POST", "/api/chat", {"text": str(i)}, cookie)[0], 200)
        self.assertEqual(self.request("POST", "/api/chat", {"text": "limit"}, cookie)[0], 429)
        with patch.object(time, "time", return_value=time.time() + api.SESSION_TTL + 1):
            self.assertEqual(self.request("GET", "/api/auth/me", cookie=cookie)[0], 401)
        _, _, headers = self.request("POST", "/api/auth/logout", {}, cookie)
        for flag in ("HttpOnly", "Secure", "SameSite=Lax", "Max-Age=0"):
            self.assertIn(flag, headers["Set-Cookie"])
        self.assertEqual(headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
