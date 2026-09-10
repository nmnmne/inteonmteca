"""Local site server: static files, email login codes, and chat."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import smtplib
import sqlite3
import sys
import threading
import time
from email.message import EmailMessage
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.generate_playlist import build_playlist

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
COOKIE_NAME = "inteonmteca_session"
CODE_TTL_SEC = 10 * 60
SESSION_TTL_SEC = 30 * 24 * 3600
MAX_CHAT_LEN = 280


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(Path(__file__).resolve().parent / ".env")
_load_dotenv(ROOT / ".env")


def smtp_config() -> dict[str, Any] | None:
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": os.environ.get("SMTP_USER", "").strip(),
        "password": os.environ.get("SMTP_PASSWORD", ""),
        "from": os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "noreply@inteonmteca.online",
        "starttls": os.environ.get("SMTP_STARTTLS", "1") != "0",
    }


def send_login_email(config: dict[str, Any], to: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "код входа — inteonmteca"
    message["From"] = str(config["from"])
    message["To"] = to
    message.set_content(f"код входа: {code}\n\nон действует 10 минут.\n")
    with smtplib.SMTP(str(config["host"]), int(config["port"]), timeout=20) as smtp:
        if config.get("starttls"):
            smtp.starttls()
        if config.get("user"):
            smtp.login(str(config["user"]), str(config["password"]))
        smtp.send_message(message)


class Store:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._setup()

    def _setup(self) -> None:
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS login_codes (
                    email TEXT PRIMARY KEY,
                    code_hash TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS rate_limits (
                    key TEXT PRIMARY KEY,
                    count INTEGER NOT NULL,
                    window_start INTEGER NOT NULL
                );
                """
            )
            row = self._db.execute("SELECT value FROM meta WHERE key = 'secret'").fetchone()
            if row is None:
                self._db.execute("INSERT INTO meta(key, value) VALUES('secret', ?)", (secrets.token_hex(24),))
            self._db.commit()

    def secret(self) -> str:
        with self._lock:
            row = self._db.execute("SELECT value FROM meta WHERE key = 'secret'").fetchone()
            return str(row["value"])

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = int(time.time())
        with self._lock:
            row = self._db.execute("SELECT count, window_start FROM rate_limits WHERE key = ?", (key,)).fetchone()
            if row is None or now - int(row["window_start"]) >= window:
                self._db.execute(
                    "INSERT OR REPLACE INTO rate_limits(key, count, window_start) VALUES(?, 1, ?)",
                    (key, now),
                )
                self._db.commit()
                return True
            count = int(row["count"])
            if count >= limit:
                return False
            self._db.execute("UPDATE rate_limits SET count = ? WHERE key = ?", (count + 1, key))
            self._db.commit()
            return True

    def upsert_user(self, email: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT OR IGNORE INTO users(email, created_at) VALUES(?, ?)",
                (email, int(time.time())),
            )
            self._db.commit()

    def user_exists(self, email: str) -> bool:
        with self._lock:
            row = self._db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
            return row is not None

    def save_code(self, email: str, code: str) -> None:
        digest = hashlib.sha256(f"{self.secret()}:{email}:{code}".encode("utf-8")).hexdigest()
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO login_codes(email, code_hash, expires_at) VALUES(?, ?, ?)",
                (email, digest, int(time.time()) + CODE_TTL_SEC),
            )
            self._db.commit()

    def check_code(self, email: str, code: str) -> bool:
        digest = hashlib.sha256(f"{self.secret()}:{email}:{code}".encode("utf-8")).hexdigest()
        now = int(time.time())
        with self._lock:
            row = self._db.execute(
                "SELECT code_hash, expires_at FROM login_codes WHERE email = ?",
                (email,),
            ).fetchone()
            if row is None or int(row["expires_at"]) < now or str(row["code_hash"]) != digest:
                return False
            self._db.execute("DELETE FROM login_codes WHERE email = ?", (email,))
            self._db.commit()
            return True

    def create_session(self, email: str) -> str:
        token = secrets.token_urlsafe(24)
        with self._lock:
            self._db.execute(
                "INSERT INTO sessions(token, email, expires_at) VALUES(?, ?, ?)",
                (token, email, int(time.time()) + SESSION_TTL_SEC),
            )
            self._db.commit()
        return token

    def email_for(self, token: str | None) -> str | None:
        if not token:
            return None
        now = int(time.time())
        with self._lock:
            row = self._db.execute(
                "SELECT email, expires_at FROM sessions WHERE token = ?",
                (token,),
            ).fetchone()
            if row is None or int(row["expires_at"]) < now:
                return None
            return str(row["email"])

    def drop_session(self, token: str | None) -> None:
        if not token:
            return
        with self._lock:
            self._db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            self._db.commit()

    def add_message(self, email: str, text: str) -> dict[str, Any]:
        created = int(time.time())
        with self._lock:
            cursor = self._db.execute(
                "INSERT INTO messages(email, text, created_at) VALUES(?, ?, ?)",
                (email, text, created),
            )
            self._db.commit()
            message_id = int(cursor.lastrowid)
        return {"id": message_id, "email": email.split("@", 1)[0] or "гость", "text": text, "created_at": created}

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def messages(self, limit: int = 80) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, email, text, created_at FROM messages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        items = [
            {"id": int(row["id"]), "email": str(row["email"]).split("@", 1)[0] or "гость", "text": str(row["text"]), "created_at": int(row["created_at"])}
            for row in rows
        ]
        items.reverse()
        return items


def make_handler(root: Path, store: Store, smtp: dict[str, Any] | None, force_dev_code: bool = False):
    root = root.resolve()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, format: str, *args: Any) -> None:
            if os.environ.get("INTEONMTECA_QUIET") == "1":
                return
            super().log_message(format, *args)

        def end_headers(self) -> None:
            origin = self.headers.get("Origin", "")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Vary", "Origin")
            if unquote(urlparse(self.path).path).startswith("/media/"):
                self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path.startswith("/media/") and self.headers.get("Range"):
                return self._serve_media_range(parsed.path, self.headers["Range"])
            if parsed.path == "/api/auth/me":
                email = store.email_for(self._token())
                if not email:
                    return self._json(HTTPStatus.UNAUTHORIZED, {"error": "нужен вход"})
                return self._json(HTTPStatus.OK, {"email": email})
            if parsed.path == "/api/chat":
                return self._json(HTTPStatus.OK, {"messages": store.messages()})
            if parsed.path == "/api/playlist":
                playlist = build_playlist(root / "media", root / "assets", root)
                return self._json(HTTPStatus.OK, playlist)
            if parsed.path == "/api" or parsed.path.startswith("/api/"):
                return self._json(HTTPStatus.NOT_FOUND, {"error": "unknown api"})
            if self._forbidden(parsed.path):
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            super().do_GET()

        def _serve_media_range(self, url_path: str, range_header: str) -> None:
            relative = unquote(url_path).lstrip("/")
            try:
                path = (root / relative).resolve()
                path.relative_to(root)
            except Exception:
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            if not path.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            size = path.stat().st_size
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not match or size <= 0:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return

            raw_start, raw_end = match.groups()
            if not raw_start and not raw_end:
                start, end = 0, size - 1
            elif not raw_start:
                suffix = max(1, int(raw_end))
                start, end = max(0, size - suffix), size - 1
            else:
                start = int(raw_start)
                end = min(size - 1, int(raw_end)) if raw_end else size - 1

            if start >= size or start > end:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return

            length = end - start + 1
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(length))
            self.end_headers()
            try:
                with path.open("rb") as source:
                    source.seek(start)
                    remaining = length
                    while remaining:
                        chunk = source.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                return

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            body = self._body()
            if parsed.path == "/api/auth/request-code":
                return self._request_code(body)
            if parsed.path == "/api/auth/verify":
                return self._verify(body)
            if parsed.path == "/api/auth/logout":
                store.drop_session(self._token())
                self._json(HTTPStatus.OK, {"ok": True}, cookie=("deleted", 0))
                return
            if parsed.path == "/api/chat":
                return self._chat(body)
            return self._json(HTTPStatus.NOT_FOUND, {"error": "unknown api"})

        def _forbidden(self, url_path: str) -> bool:
            relative = unquote(url_path).lstrip("/")
            if not relative:
                return False
            try:
                path = (root / relative).resolve()
                path.relative_to(root)
            except Exception:
                return True
            parts = set(path.relative_to(root).parts)
            if ".git" in parts or path.name == ".env" or path.suffix == ".db":
                return True
            return False

        def _body(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(length) if length else b""
            if not raw:
                return {}
            try:
                data = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                return {}
            return data if isinstance(data, dict) else {}

        def _token(self) -> str | None:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            morsel = cookie.get(COOKIE_NAME)
            return morsel.value if morsel else None

        def _client(self) -> str:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[0].strip()
            return self.client_address[0]

        def _request_code(self, body: dict[str, Any]) -> None:
            email = str(body.get("email", "")).strip().lower()
            if not EMAIL_RE.match(email):
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "нужна почта: имя@example.com"})
            if not store.allow(f"email:{email}", 5, 3600) or not store.allow(f"ip:{self._client()}", 12, 3600):
                return self._json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "слишком часто, подожди"})
            store.upsert_user(email)
            code = f"{secrets.randbelow(1_000_000):06d}"
            store.save_code(email, code)
            payload: dict[str, Any] = {"ok": True}
            direct_code = os.environ.get("INTEONMTECA_DIRECT_CODE", "1") != "0"
            if smtp and not force_dev_code and not direct_code:
                try:
                    send_login_email(smtp, email, code)
                except Exception:
                    return self._json(HTTPStatus.BAD_GATEWAY, {"error": "не удалось отправить письмо"})
            else:
                payload["login_code"] = code
            return self._json(HTTPStatus.OK, payload)

        def _verify(self, body: dict[str, Any]) -> None:
            email = str(body.get("email", "")).strip().lower()
            code = str(body.get("code", "")).strip()
            if not EMAIL_RE.match(email) or len(code) != 6 or not code.isdigit():
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "неверный код"})
            if not store.check_code(email, code):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "код не подошёл"})
            store.upsert_user(email)
            token = store.create_session(email)
            return self._json(HTTPStatus.OK, {"ok": True, "email": email}, cookie=(token, SESSION_TTL_SEC))

        def _chat(self, body: dict[str, Any]) -> None:
            email = store.email_for(self._token())
            if not email:
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "сначала войди"})
            text = " ".join(str(body.get("text", "")).split())
            if not text:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "пусто"})
            if len(text) > MAX_CHAT_LEN:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "слишком длинно"})
            message = store.add_message(email, text)
            return self._json(HTTPStatus.OK, {"message": message, "messages": store.messages()})

        def _json(self, status: HTTPStatus, payload: dict[str, Any] | list[Any], cookie: tuple[str, int] | None = None) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            if cookie is not None:
                token, max_age = cookie
                if max_age <= 0:
                    self.send_header("Set-Cookie", f"{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
                else:
                    secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
                    self.send_header(
                        "Set-Cookie",
                        f"{COOKIE_NAME}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}",
                    )
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def guess_type(self, path: str) -> str:  # type: ignore[override]
            if path.lower().endswith(".flac"):
                return "audio/flac"
            if path.lower().endswith(".svg"):
                return "image/svg+xml"
            return super().guess_type(path)

    Handler.extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        ".flac": "audio/flac",
        ".json": "application/json",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }
    return Handler


def serve(root: Path | None = None, host: str = "127.0.0.1", port: int = 8080, db_path: Path | None = None) -> ThreadingHTTPServer:
    site_root = (root or ROOT).resolve()
    database = db_path or (Path(__file__).resolve().parent / "data" / "inteonmteca.db")
    store = Store(database)
    handler = make_handler(site_root, store, smtp_config(), force_dev_code=os.environ.get("INTEONMTECA_DEV") == "1")
    server = ThreadingHTTPServer((host, port), handler)
    return server


def main() -> int:
    host = os.environ.get("INTEONMTECA_HOST", "127.0.0.1")
    port = int(os.environ.get("INTEONMTECA_PORT", "8080"))
    server = serve(host=host, port=port)
    print(f"inteonmteca  http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstop")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
