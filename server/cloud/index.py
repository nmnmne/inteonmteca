"""Shared public guest chat. A screen code is NOT proof of email ownership."""
import base64
import hashlib
import json
import logging
import os
import re
import secrets
import threading
import time
import urllib.request
from http.cookies import SimpleCookie

COOKIE = "inteonmteca_guest"
SESSION_TTL = 30 * 86400
CODE_TTL = 600
MODERATOR_EMAIL = "nm@nmnmne.ru"
ORIGIN = "https://inteonmteca.online"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_store = None
_lock = threading.Lock()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class YdbTransaction:
    def __init__(self, session, tx, now):
        self.session, self.tx, self.now = session, tx, now

    def execute(self, sql, parameters):
        return self.tx.execute(self.session.prepare(sql), parameters)

    def get(self, key, default=None):
        rows = self.execute(
            "DECLARE $key AS Utf8; SELECT value, expires_at FROM chat_state WHERE key=$key;",
            {"$key": key},
        )[0].rows
        if not rows or (rows[0].expires_at and rows[0].expires_at <= self.now):
            return default
        return json.loads(rows[0].value)

    def put(self, key, value, expires_at=None):
        self.execute(
            "DECLARE $key AS Utf8; DECLARE $value AS Utf8; DECLARE $expires AS Uint64?; "
            "UPSERT INTO chat_state (key,value,expires_at) VALUES ($key,$value,$expires);",
            {"$key": key, "$value": json.dumps(value, ensure_ascii=False), "$expires": expires_at},
        )

    def delete(self, key):
        self.execute("DECLARE $key AS Utf8; DELETE FROM chat_state WHERE key=$key;", {"$key": key})


class YdbStore:
    def __init__(self):
        import ydb
        import ydb.iam
        self.ydb = ydb
        self.driver = ydb.Driver(
            endpoint=os.environ["YDB_ENDPOINT"], database=os.environ["YDB_DATABASE"],
            credentials=ydb.credentials_from_env_variables(),
        )
        self.driver.wait(timeout=10, fail_fast=True)
        self.pool = ydb.SessionPool(self.driver, size=5)

    def transact(self, action):
        def run(session):
            with session.transaction(self.ydb.SerializableReadWrite()) as tx:
                result = action(YdbTransaction(session, tx, int(time.time())))
                tx.commit()
                return result
        return self.pool.retry_operation_sync(run)


def get_store():
    global _store
    if _store is None:
        with _lock:
            if _store is None:
                _store = YdbStore()
    return _store


def allow(tx, key, limit, window, now):
    key = "rate:" + digest(key)
    count = tx.get(key, 0)
    if count >= limit:
        return False
    # Fixed windows, with expired rows removed by the database TTL.
    tx.put(key, count + 1, (now // window + 1) * window)
    return True


def send_login_email(email, code, context):
    """Best effort only; never log addresses, codes, tokens or raw provider errors."""
    sender = os.environ.get("POSTBOX_FROM")
    if not sender:
        return
    try:
        token = context.token["access_token"]
        payload = {
            "FromEmailAddress": sender,
            "Destination": {"ToAddresses": [email]},
            "Content": {"Simple": {
                "Subject": {"Data": "Код входа — inteonmteca", "Charset": "UTF-8"},
                "Body": {"Text": {"Data": f"Код входа: {code}\nДействует 10 минут.\nЕсли вы не запрашивали код, проигнорируйте письмо.", "Charset": "UTF-8"}},
            }},
        }
        request = urllib.request.Request(
            "https://postbox.cloud.yandex.net/v2/email/outbound-emails",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "X-YaCloud-SubjectToken": token},
        )
        with urllib.request.urlopen(request, timeout=4) as response:
            receipt = json.load(response)
        print(json.dumps({"event": "login_email_accepted", "message_id": receipt.get("MessageId")}))
    except Exception as error:
        logging.warning("Optional login email unavailable (%s, status=%s)", type(error).__name__, getattr(error, "code", None))


def response(status, payload, origin="", token=None):
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin"}
    if origin == ORIGIN:
        headers.update({"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
                        "Access-Control-Max-Age": "600"})
    if token is not None:
        headers["Set-Cookie"] = f"{COOKIE}={token}; Path=/api; Max-Age={SESSION_TTL if token else 0}; HttpOnly; Secure; SameSite=Lax"
    return {"statusCode": status, "headers": headers, "body": json.dumps(payload, ensure_ascii=False)}


def handle(event, context, store, mailer=send_login_email):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    origin = headers.get("origin", "")
    reply = lambda status, payload, **kwargs: response(status, payload, origin, **kwargs)
    if origin and origin != ORIGIN:
        return reply(403, {"error": "недопустимый источник запроса"})
    method, path = event.get("httpMethod"), event.get("path")
    if method == "OPTIONS":
        return reply(204, {})
    cookie = SimpleCookie()
    try:
        cookie.load(headers.get("cookie", ""))
    except Exception:
        pass
    token = cookie[COOKIE].value if COOKIE in cookie else ""
    session_key = "session:" + digest(token)
    now = int(time.time())
    ip = (event.get("requestContext", {}).get("identity") or {}).get("sourceIp", "unknown")
    if method == "GET":
        if path == "/api/chat":
            return reply(200, {"messages": store.transact(lambda tx: tx.get("messages", []))})
        if path == "/api/auth/me":
            session = store.transact(lambda tx: tx.get(session_key)) if token else None
            return reply(200, {"email": session["email"], "guest": True, "can_moderate": can_moderate(session)}) if session else reply(401, {"error": "нужен вход"})
        if path == "/api/runtime":
            return reply(200, {"debug": False, "shared_chat": True, "guest": True})
    if method != "POST":
        return reply(404, {"error": "unknown api"})
    raw = event.get("body") or ""
    if len(raw) > 90000:
        return reply(413, {"error": "запрос слишком большой"})
    if headers.get("content-type", "").split(";")[0].strip() != "application/json":
        return reply(415, {"error": "нужен JSON"})
    try:
        raw = base64.b64decode(raw, validate=True) if event.get("isBase64Encoded") else raw.encode()
        if len(raw) > 65536:
            return reply(413, {"error": "запрос слишком большой"})
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError()
    except (ValueError, UnicodeError):
        return reply(400, {"error": "неверный запрос"})

    if path == "/api/auth/request-code":
        email = str(body.get("email", "")).strip().lower()
        if len(email) > 254 or not EMAIL.fullmatch(email):
            return reply(400, {"error": "нужна почта: имя@example.com"})
        code, challenge = f"{secrets.randbelow(1000000):06d}", secrets.token_urlsafe(24)
        mail_code = code
        if email == MODERATOR_EMAIL:
            while mail_code == code:
                mail_code = f"{secrets.randbelow(1000000):06d}"
        def create(tx):
            if not allow(tx, "login-ip:" + ip, 12, 3600, now) or not allow(tx, "login-email:" + email, 5, 3600, now):
                return False
            saved = {"email": email, "code": digest(challenge + code)}
            if email == MODERATOR_EMAIL:
                saved["moderator_code"] = digest(challenge + mail_code)
            tx.put("code:" + digest(challenge), saved, now + CODE_TTL)
            return True
        if not store.transact(create):
            return reply(429, {"error": "слишком часто, подожди"})
        # Sending is outside the retried transaction, so retries never duplicate mail.
        try:
            mailer(email, mail_code, context)
        except Exception:
            logging.warning("Optional login mail unavailable")
        return reply(200, {"ok": True, "login_code": code, "challenge": challenge, "guest": True,
                           "moderator_email_code": email == MODERATOR_EMAIL})

    if path == "/api/auth/verify":
        email = str(body.get("email", "")).strip().lower()
        code, challenge = str(body.get("code", "")), str(body.get("challenge", ""))
        if not re.fullmatch(r"\d{6}", code) or not 20 <= len(challenge) <= 100:
            return reply(400, {"error": "неверный код"})
        new_token = secrets.token_urlsafe(32)
        def verify(tx):
            if not allow(tx, "verify-ip:" + ip, 30, CODE_TTL, now) or not allow(tx, "verify:" + challenge, 5, CODE_TTL, now):
                return 429, False
            key = "code:" + digest(challenge)
            saved = tx.get(key)
            if not saved or saved["email"] != email:
                return 401, False
            verified_moderator = email == MODERATOR_EMAIL and secrets.compare_digest(saved.get("moderator_code", ""), digest(challenge + code))
            if not verified_moderator and not secrets.compare_digest(saved["code"], digest(challenge + code)):
                return 401, False
            tx.delete(key)
            tx.put("session:" + digest(new_token), {"email": email, "can_moderate": verified_moderator}, now + SESSION_TTL)
            return 200, verified_moderator
        status, moderator = store.transact(verify)
        if status != 200:
            return reply(status, {"error": "слишком часто, подожди" if status == 429 else "код не подошёл"})
        return reply(200, {"ok": True, "email": email, "guest": True, "can_moderate": moderator}, token=new_token)

    if path == "/api/auth/logout":
        store.transact(lambda tx: tx.delete(session_key))
        return reply(200, {"ok": True}, token="")

    if path == "/api/chat/delete":
        message_id = body.get("id")
        if not isinstance(message_id, str) or not re.fullmatch(r"[0-9a-f]{24}", message_id):
            return reply(400, {"error": "неверное сообщение"})
        def remove(tx):
            session = tx.get(session_key) if token else None
            if not session:
                return 401, {"error": "сначала войди"}
            if not can_moderate(session):
                return 403, {"error": "для удаления нужен вход с кодом из письма владельцу"}
            messages = tx.get("messages", [])
            removed = next((m for m in messages if m["id"] == message_id), None)
            if removed:
                tx.put("deleted:" + message_id, removed, now + 7 * 86400)
                messages = [m for m in messages if m["id"] != message_id]
                tx.put("messages", messages)
            return 200, {"ok": True, "messages": messages}
        status, result = store.transact(remove)
        return reply(status, result)

    if path == "/api/chat":
        text = " ".join(str(body.get("text", "")).split())
        if not text or len(text) > 280:
            return reply(400, {"error": "слишком длинно" if text else "пусто"})
        message_id = secrets.token_hex(12)
        def post(tx):
            session = tx.get(session_key) if token else None
            if not session:
                return 401, {"error": "сначала войди"}
            if not allow(tx, "chat-ip:" + ip, 30, 60, now) or not allow(tx, "chat-session:" + digest(token), 10, 60, now):
                return 429, {"error": "слишком часто, подожди"}
            message = {"id": message_id, "email": session["email"].split("@", 1)[0], "text": text, "created_at": now}
            messages = tx.get("messages", [])[-49:] + [message]
            tx.put("messages", messages)
            return 200, {"message": message, "messages": messages}
        status, result = store.transact(post)
        return reply(status, result)
    return reply(404, {"error": "unknown api"})


def can_moderate(session):
    return session.get("email") == MODERATOR_EMAIL and session.get("can_moderate") is True


def handler(event, context):
    try:
        return handle(event, context, get_store())
    except Exception as error:
        logging.error("Chat backend unavailable (%s)", type(error).__name__)
        origin = (event.get("headers") or {}).get("origin", (event.get("headers") or {}).get("Origin", ""))
        return response(503, {"error": "чат временно недоступен — попробуй позже"}, origin)
