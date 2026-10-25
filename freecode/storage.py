"""Account and audit storage for Free way.

Two backends share one SQL layer:
  * local (default): a SQLite file in the data folder, so local-files mode keeps working
    with no setup and no network;
  * postgres: used when the DATABASE_URL environment variable is set (for example a Supabase
    connection string). The value is never logged, printed or returned by any API.

Tables: users, sessions, login_events, projects_meta, usage_events, ad_events, error_log.
The Supabase migration in migrations/001_free_way_init.sql creates the same tables and
enables row-level security. This module only uses the Python standard library; the
Postgres driver (psycopg 3 or psycopg2) is imported lazily when DATABASE_URL is set.
"""
from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

OWNER_ID = "owner"
MAX_TEXT = 500

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT, name TEXT,
        created_at DOUBLE PRECISION NOT NULL, last_login_at DOUBLE PRECISION, disabled INTEGER NOT NULL DEFAULT 0)""",
    """CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
        expires_at DOUBLE PRECISION NOT NULL, ip TEXT, user_agent TEXT)""",
    """CREATE TABLE IF NOT EXISTS login_events (
        id TEXT PRIMARY KEY, user_id TEXT, email TEXT, name TEXT, at DOUBLE PRECISION NOT NULL,
        ip TEXT, user_agent TEXT, success INTEGER NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS projects_meta (
        kind TEXT NOT NULL, obj_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (kind, obj_id))""",
    """CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, at DOUBLE PRECISION NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ad_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, ad_id TEXT, at DOUBLE PRECISION NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS error_log (
        id TEXT PRIMARY KEY, at DOUBLE PRECISION NOT NULL, source TEXT NOT NULL, level TEXT NOT NULL,
        message TEXT NOT NULL, user_id TEXT, path TEXT)""",
    "CREATE INDEX IF NOT EXISTS login_events_user ON login_events (user_id, at)",
    "CREATE INDEX IF NOT EXISTS projects_meta_owner ON projects_meta (owner_id, kind)",
    "CREATE INDEX IF NOT EXISTS usage_events_user ON usage_events (user_id, at)",
    "CREATE INDEX IF NOT EXISTS error_log_at ON error_log (at)",
]


def _clip(value, limit: int = MAX_TEXT):
    if value is None:
        return None
    return str(value)[:limit]


def user_id_for_sub(sub: str) -> str:
    return "u_" + hashlib.sha256(("free-way:" + sub).encode("utf-8")).hexdigest()[:24]


class SqlStorage:
    """Portable SQL (SQLite and Postgres). `paramstyle` is "qmark" (?) or "format" (%s)."""

    backend = "sql"

    def __init__(self, connect, paramstyle: str = "qmark", backend: str = "local"):
        self._connect_fn = connect
        self._mark = "?" if paramstyle == "qmark" else "%s"
        self.backend = backend
        self._lock = threading.RLock()
        with self._db() as db:
            cur = db.cursor()
            for statement in SCHEMA:
                cur.execute(statement)
        self.upsert_owner()

    @contextmanager
    def _db(self):
        with self._lock:
            db = self._connect_fn()
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

    def _q(self, sql: str) -> str:
        return sql.replace("?", self._mark)

    def _exec(self, sql: str, params=()):
        with self._db() as db:
            cur = db.cursor()
            cur.execute(self._q(sql), tuple(params))

    def _all(self, sql: str, params=()) -> list[dict]:
        with self._db() as db:
            cur = db.cursor()
            cur.execute(self._q(sql), tuple(params))
            names = [d[0] for d in cur.description]
            return [dict(zip(names, row)) for row in cur.fetchall()]

    def ping(self) -> bool:
        try:
            return self._all("SELECT 1 AS ok")[0]["ok"] == 1
        except Exception:
            return False

    # ----- users and logins -----
    def upsert_owner(self) -> None:
        self._exec("INSERT INTO users (id, google_sub, email, name, created_at, disabled) VALUES (?, NULL, NULL, ?, ?, 0) "
                   "ON CONFLICT (id) DO NOTHING", (OWNER_ID, "Owner (this computer)", time.time()))

    def upsert_user(self, sub: str, email: str | None, name: str | None) -> dict:
        uid = user_id_for_sub(sub)
        now = time.time()
        self._exec("INSERT INTO users (id, google_sub, email, name, created_at, last_login_at, disabled) VALUES (?, ?, ?, ?, ?, ?, 0) "
                   "ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at",
                   (uid, _clip(sub, 255), _clip(email, 320), _clip(name, 200), now, now))
        return self.get_user(uid)

    def get_user(self, uid: str) -> dict | None:
        rows = self._all("SELECT id, email, name, created_at, last_login_at, disabled FROM users WHERE id = ?", (uid,))
        if not rows:
            return None
        row = rows[0]
        row["disabled"] = bool(row["disabled"])
        return row

    def set_disabled(self, uid: str, disabled: bool) -> dict | None:
        if uid == OWNER_ID and disabled:
            raise ValueError("the owner account cannot be disabled")
        self._exec("UPDATE users SET disabled = ? WHERE id = ?", (1 if disabled else 0, uid))
        return self.get_user(uid)

    def record_login(self, uid: str | None, email, name, ip, user_agent, success: bool) -> None:
        self._exec("INSERT INTO login_events (id, user_id, email, name, at, ip, user_agent, success) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (uuid.uuid4().hex, uid, _clip(email, 320), _clip(name, 200), time.time(), _clip(ip, 64), _clip(user_agent, 300), 1 if success else 0))

    def record_session(self, session_id: str, uid: str, expires_at: float, ip, user_agent) -> None:
        digest = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
        self._exec("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?) "
                   "ON CONFLICT (id_hash) DO NOTHING", (digest, uid, time.time(), float(expires_at), _clip(ip, 64), _clip(user_agent, 300)))

    def list_users(self) -> list[dict]:
        users = self._all("SELECT id, email, name, created_at, last_login_at, disabled FROM users ORDER BY created_at")
        logins = {r["user_id"]: r["n"] for r in self._all("SELECT user_id, COUNT(*) AS n FROM login_events WHERE success = 1 GROUP BY user_id")}
        projects = {r["owner_id"]: r["n"] for r in self._all("SELECT owner_id, COUNT(*) AS n FROM projects_meta WHERE kind = 'project' GROUP BY owner_id")}
        for user in users:
            user["disabled"] = bool(user["disabled"])
            user["logins"] = int(logins.get(user["id"], 0))
            user["projects"] = int(projects.get(user["id"], 0))
        return users

    def user_detail(self, uid: str) -> dict | None:
        user = self.get_user(uid)
        if user is None:
            return None
        user["logins"] = self._all("SELECT at, ip, user_agent, success FROM login_events WHERE user_id = ? ORDER BY at DESC LIMIT 50", (uid,))
        for item in user["logins"]:
            item["success"] = bool(item["success"])
        user["projects"] = [r["obj_id"] for r in self._all("SELECT obj_id FROM projects_meta WHERE owner_id = ? AND kind = 'project' ORDER BY created_at", (uid,))]
        user["usage"] = {r["kind"]: float(r["total"]) for r in self._all("SELECT kind, SUM(amount) AS total FROM usage_events WHERE user_id = ? GROUP BY kind", (uid,))}
        user["active_sessions"] = int(self._all("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?", (uid, time.time()))[0]["n"])
        return user

    # ----- ownership (per-user isolation) -----
    def claim(self, owner_id: str, kind: str, obj_id: str) -> bool:
        """Record ownership; returns False when another user already owns obj_id."""
        rows = self._all("SELECT owner_id FROM projects_meta WHERE kind = ? AND obj_id = ?", (kind, obj_id))
        if rows:
            return rows[0]["owner_id"] == owner_id
        self._exec("INSERT INTO projects_meta (kind, obj_id, owner_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (kind, obj_id) DO NOTHING",
                   (kind, obj_id, owner_id, time.time()))
        return self.owner_of(kind, obj_id) == owner_id

    def owner_of(self, kind: str, obj_id: str) -> str | None:
        rows = self._all("SELECT owner_id FROM projects_meta WHERE kind = ? AND obj_id = ?", (kind, obj_id))
        return rows[0]["owner_id"] if rows else None

    def owned(self, owner_id: str, kind: str) -> set[str]:
        return {r["obj_id"] for r in self._all("SELECT obj_id FROM projects_meta WHERE owner_id = ? AND kind = ?", (owner_id, kind))}

    # ----- usage, ads, errors -----
    def record_usage(self, uid: str, kind: str, amount: float = 1.0) -> None:
        self._exec("INSERT INTO usage_events (id, user_id, kind, amount, at) VALUES (?, ?, ?, ?, ?)", (uuid.uuid4().hex, uid, _clip(kind, 40), float(amount), time.time()))

    def record_ad_event(self, uid: str, kind: str, ad_id: str | None) -> None:
        self._exec("INSERT INTO ad_events (id, user_id, kind, ad_id, at) VALUES (?, ?, ?, ?, ?)", (uuid.uuid4().hex, uid, _clip(kind, 40), _clip(ad_id, 120), time.time()))

    def ad_summary(self) -> dict:
        rows = self._all("SELECT kind, COUNT(*) AS n FROM ad_events GROUP BY kind")
        return {r["kind"]: int(r["n"]) for r in rows}

    def log_error(self, source: str, message: str, *, level: str = "error", user_id: str | None = None, path: str | None = None) -> None:
        try:
            self._exec("INSERT INTO error_log (id, at, source, level, message, user_id, path) VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (uuid.uuid4().hex, time.time(), _clip(source, 40), _clip(level, 16), _clip(message, 1000) or "error", _clip(user_id, 64), _clip(path, 300)))
        except Exception:
            pass  # error logging must never break a request

    def list_errors(self, limit: int = 100, source: str | None = None) -> list[dict]:
        limit = max(1, min(int(limit), 500))
        if source:
            return self._all("SELECT at, source, level, message, user_id, path FROM error_log WHERE source = ? ORDER BY at DESC LIMIT ?", (source, limit))
        return self._all("SELECT at, source, level, message, user_id, path FROM error_log ORDER BY at DESC LIMIT ?", (limit,))

    def counts(self) -> dict:
        one = lambda sql: int(self._all(sql)[0]["n"])
        return {"users": one("SELECT COUNT(*) AS n FROM users"), "logins": one("SELECT COUNT(*) AS n FROM login_events WHERE success = 1"),
                "errors_24h": int(self._all("SELECT COUNT(*) AS n FROM error_log WHERE at > ?", (time.time() - 86_400,))[0]["n"])}


def local_storage(data_dir) -> SqlStorage:
    path = Path(data_dir) / "accounts.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    return SqlStorage(lambda: sqlite3.connect(path, timeout=10), "qmark", backend="local")


def _add_driver_dir(environ=None) -> str | None:
    """Make an optional side-loaded driver folder importable (never the bundled Python's site-packages).

    FW_PYDEPS, or <repo>/pydeps, is filled by scripts/install-pg-driver.ps1 with `pip install --target`.
    """
    import sys
    environ = os.environ if environ is None else environ
    folder = Path(environ.get("FW_PYDEPS") or Path(__file__).resolve().parent.parent / "pydeps")
    if folder.is_dir() and str(folder) not in sys.path:
        sys.path.append(str(folder))
        return str(folder)
    return None


def postgres_storage(url: str) -> SqlStorage:
    _add_driver_dir()
    try:
        import psycopg  # type: ignore
        connect = lambda: psycopg.connect(url, connect_timeout=10)
    except ImportError:
        import psycopg2  # type: ignore  # raises ImportError when no driver is installed
        connect = lambda: psycopg2.connect(url, connect_timeout=10)
    return SqlStorage(connect, "format", backend="postgres")


def make_storage(data_dir, environ=None) -> tuple[SqlStorage, str | None]:
    """Return (storage, warning). Never includes DATABASE_URL in any message."""
    environ = os.environ if environ is None else environ
    url = (environ.get("DATABASE_URL") or "").strip()
    if not url:
        return local_storage(data_dir), None
    try:
        return postgres_storage(url), None
    except ImportError:
        warning = "DATABASE_URL is set but no Postgres driver (psycopg) is installed; using local storage."
    except Exception:
        warning = "DATABASE_URL is set but the database could not be reached; using local storage."
    return local_storage(data_dir), warning
