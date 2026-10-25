"""Step 5: storage backends, multi-user Google sign-in, login audit, per-user isolation, error log."""
from __future__ import annotations

import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from freecode import storage as storagemod
from freecode.google_auth import AuthError, ConfigurationError, GoogleAuthConfig, OwnerAuth

ROOT = Path(__file__).resolve().parents[2]
CLIENT_ID = "1234-test.apps.googleusercontent.com"
ORIGIN = "https://freeway.test"


class FormatCursor:
    """Fake Postgres driver cursor: accepts %s placeholders like psycopg, runs on SQLite."""

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        assert "?" not in sql, "Postgres adapter must not send qmark placeholders"
        return self._cur.execute(sql.replace("%s", "?"), params)

    def __getattr__(self, name):
        return getattr(self._cur, name)


class FormatConnection:
    def __init__(self, path):
        self._db = sqlite3.connect(path)

    def cursor(self):
        return FormatCursor(self._db.cursor())

    def commit(self):
        self._db.commit()

    def rollback(self):
        self._db.rollback()

    def close(self):
        self._db.close()


def exercise(test, store):
    user = store.upsert_user("sub-1", "a@example.com", "Ada")
    test.assertEqual(user["email"], "a@example.com")
    store.record_login(user["id"], "a@example.com", "Ada", "203.0.113.5", "UA/1", True)
    store.record_login(None, None, None, "203.0.113.9", "UA/2", False)
    store.record_session("cookie-id", user["id"], time.time() + 60, "203.0.113.5", "UA/1")
    test.assertTrue(store.claim(user["id"], "project", "alpha"))
    test.assertFalse(store.claim(storagemod.OWNER_ID, "project", "alpha"))
    test.assertEqual(store.owned(user["id"], "project"), {"alpha"})
    store.record_usage(user["id"], "agent_run")
    store.record_ad_event(user["id"], "impression", "ad-1")
    store.log_error("server", "boom", path="/api/x")
    users = {u["id"]: u for u in store.list_users()}
    test.assertIn(storagemod.OWNER_ID, users)
    test.assertEqual((users[user["id"]]["logins"], users[user["id"]]["projects"]), (1, 1))
    detail = store.user_detail(user["id"])
    test.assertEqual(detail["projects"], ["alpha"])
    test.assertEqual(detail["usage"], {"agent_run": 1.0})
    test.assertEqual(detail["active_sessions"], 1)
    test.assertEqual(detail["logins"][0]["ip"], "203.0.113.5")
    test.assertTrue(store.set_disabled(user["id"], True)["disabled"])
    with test.assertRaises(ValueError):
        store.set_disabled(storagemod.OWNER_ID, True)
    test.assertEqual(store.list_errors()[0]["message"], "boom")
    test.assertEqual(store.ad_summary(), {"impression": 1})
    test.assertEqual(store.counts()["users"], 2)
    test.assertTrue(store.ping())


class StorageBackendTests(unittest.TestCase):
    def test_local_sqlite_backend(self):
        with tempfile.TemporaryDirectory() as d:
            store = storagemod.local_storage(d)
            self.assertEqual(store.backend, "local")
            exercise(self, store)

    def test_postgres_adapter_sql_with_fake_driver(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "fake-pg.sqlite"
            store = storagemod.SqlStorage(lambda: FormatConnection(path), "format", backend="postgres")
            exercise(self, store)

    def test_database_url_fallback_never_reveals_the_url(self):
        secret_url = "postgresql://user:TOPSECRETPW@db.example.invalid:5432/postgres"
        with tempfile.TemporaryDirectory() as d:
            with patch.object(storagemod, "postgres_storage", side_effect=ImportError("no psycopg")):
                store, warning = storagemod.make_storage(d, {"DATABASE_URL": secret_url})
            self.assertEqual(store.backend, "local")
            self.assertIn("no Postgres driver", warning)
            with patch.object(storagemod, "postgres_storage", side_effect=RuntimeError(secret_url)):
                _, warning = storagemod.make_storage(d, {"DATABASE_URL": secret_url})
            self.assertNotIn("TOPSECRETPW", warning)
            self.assertNotIn("db.example.invalid", warning)
            store, warning = storagemod.make_storage(d, {})
            self.assertIsNone(warning)

    def test_supabase_migration_matches_schema_and_enables_rls(self):
        sql = (ROOT / "migrations" / "001_free_way_init.sql").read_text(encoding="utf-8").lower()
        for table in ("users", "sessions", "login_events", "projects_meta", "usage_events", "ad_events", "error_log"):
            self.assertIn(f"create table if not exists {table} (", sql)
            self.assertIn(f"alter table {table} enable row level security;", sql)
            self.assertTrue(any(f"exists {table} (" in s.lower() for s in storagemod.SCHEMA))


class FakeVerifier:
    def __init__(self):
        self.claims = {}

    def verify(self, credential, client_id):
        return dict(self.claims)


def login(auth, verifier, sub, *, email="u@example.com", verified=True):
    challenge = auth.issue_challenge(origin=ORIGIN, peer="127.0.0.1")
    verifier.claims = {"aud": CLIENT_ID, "iss": "https://accounts.google.com", "exp": time.time() + 600, "sub": sub,
                       "nonce": challenge.nonce, "email": email, "email_verified": verified, "name": "User " + sub}
    return auth.verify_login(credential="aaa.bbb.ccc", challenge_cookie=challenge.cookie_id, login_csrf=challenge.csrf,
                             origin=ORIGIN, peer="127.0.0.1")


class MultiUserAuthTests(unittest.TestCase):
    def test_config_multi_user_does_not_need_owner_sub(self):
        env = {"FC_GOOGLE_AUTH": "on", "FC_GOOGLE_CLIENT_ID": CLIENT_ID, "FC_GOOGLE_ORIGIN": ORIGIN, "FC_GOOGLE_MULTI_USER": "on"}
        config = GoogleAuthConfig.from_env(env)
        self.assertTrue(config.multi_user)
        self.assertIsNone(config.owner_sub)
        env.pop("FC_GOOGLE_MULTI_USER")
        with self.assertRaises(ConfigurationError):
            GoogleAuthConfig.from_env(env)

    def test_any_verified_google_account_can_sign_in_when_multi_user(self):
        verifier = FakeVerifier()
        auth = OwnerAuth(GoogleAuthConfig(True, CLIENT_ID, None, ORIGIN, True), verifier=verifier)
        issue = login(auth, verifier, "sub-a", email="a@example.com")
        self.assertEqual((issue.sub, issue.email), ("sub-a", "a@example.com"))
        info = auth.get_session(issue.cookie_id)
        self.assertEqual(info.email, "a@example.com")
        with self.assertRaises(AuthError):
            login(auth, verifier, "sub-b", verified=False)

    def test_owner_only_mode_still_rejects_other_accounts(self):
        verifier = FakeVerifier()
        auth = OwnerAuth(GoogleAuthConfig(True, CLIENT_ID, "owner-sub", ORIGIN), verifier=verifier)
        self.assertEqual(login(auth, verifier, "owner-sub").sub, "owner-sub")
        with self.assertRaises(AuthError):
            login(auth, verifier, "someone-else")


def http(base, path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(base + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}"), r.headers
    except HTTPError as e:
        return e.code, json.loads(e.read() or b"{}"), e.headers


def cookie_value(headers, name):
    for item in headers.get_all("Set-Cookie") or []:
        if item.startswith(name + "="):
            return item.split(";", 1)[0].split("=", 1)[1]
    return None


class MultiUserServerTests(unittest.TestCase):
    def setUp(self):
        import server_fixture  # noqa: F401  (offline env defaults)
        from freecode.server import App, serve
        import threading
        self.temp = tempfile.TemporaryDirectory(prefix="freeway-mu-")
        self.addCleanup(self.temp.cleanup)
        self.verifier = FakeVerifier()
        auth = OwnerAuth(GoogleAuthConfig(True, CLIENT_ID, None, ORIGIN, True), verifier=self.verifier)
        self.app = App(self.temp.name, mode="local", token=None, mock=True, owner_auth=auth)
        self.httpd = serve(self.app, "127.0.0.1", 0)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def sign_in(self, sub, email):
        status, body, headers = http(self.base, "/api/auth/challenge", "POST", {}, {"Origin": ORIGIN})
        self.assertEqual(status, 200)
        login_cookie = cookie_value(headers, "__Host-fc_login")
        self.verifier.claims = {"aud": CLIENT_ID, "iss": "accounts.google.com", "exp": time.time() + 600, "sub": sub,
                                "nonce": body["nonce"], "email": email, "email_verified": True, "name": email.split("@")[0]}
        status, session, headers = http(self.base, "/api/auth/google", "POST", {"credential": "aaa.bbb.ccc"},
                                        {"Origin": ORIGIN, "X-FC-LOGIN-CSRF": body["csrf"], "Cookie": f"__Host-fc_login={login_cookie}",
                                         "User-Agent": "FreewayTest/1.0", "CF-Connecting-IP": "198.51.100.7"})
        if status != 200:
            return status, None
        sid = cookie_value(headers, "__Host-fc_session")
        return status, {"Cookie": f"__Host-fc_session={sid}", "X-FC-CSRF": session["csrf"], "Origin": ORIGIN}

    def test_logins_are_recorded_and_users_are_isolated(self):
        _, alice = self.sign_in("sub-alice", "alice@example.com")
        _, bob = self.sign_in("sub-bob", "bob@example.com")
        self.assertEqual(http(self.base, "/api/projects", "POST", {"id": "alice-site"}, alice)[0], 201)
        self.assertEqual(http(self.base, "/api/projects", headers=alice)[1], ["alice-site"])
        self.assertEqual(http(self.base, "/api/projects", headers=bob)[1], [])
        self.assertEqual(http(self.base, "/api/projects/alice-site/files", headers=bob)[0], 404)
        self.assertEqual(http(self.base, "/api/projects", "POST", {"id": "alice-site"}, bob)[0], 409)
        self.assertEqual(http(self.base, "/api/projects", "POST", {"id": "demo"}, bob)[0], 409)
        self.assertEqual(http(self.base, "/api/settings", "PUT", {"advanced_mode": True}, bob)[0], 403)
        users = {u["email"]: u for u in self.app.storage.list_users() if u["email"]}
        self.assertEqual(set(users), {"alice@example.com", "bob@example.com"})
        detail = self.app.storage.user_detail(users["alice@example.com"]["id"])
        self.assertEqual(detail["logins"][0]["ip"], "198.51.100.7")
        self.assertEqual(detail["logins"][0]["user_agent"], "FreewayTest/1.0")
        self.assertEqual(detail["projects"], ["alice-site"])

    def test_disabled_user_cannot_sign_in_or_use_an_old_session(self):
        _, carol = self.sign_in("sub-carol", "carol@example.com")
        uid = storagemod.user_id_for_sub("sub-carol")
        self.app.storage.set_disabled(uid, True)
        self.assertEqual(http(self.base, "/api/projects", headers=carol)[0], 403)
        status, _ = self.sign_in("sub-carol", "carol@example.com")
        self.assertEqual(status, 403)
        failed = [e for e in self.app.storage.user_detail(uid)["logins"] if not e["success"]]
        self.assertTrue(failed)


class ErrorLogServerTests(unittest.TestCase):
    def test_browser_reports_and_unexpected_errors_are_logged_with_friendly_message(self):
        from server_fixture import running_server
        with running_server() as (app, base):
            self.assertEqual(http(base, "/api/errors/report", "POST", {"message": "TypeError in panel", "path": "/"})[0], 202)
            with patch.object(app.ws, "list_projects", side_effect=ZeroDivisionError("division by zero")):
                status, body, _ = http(base, "/api/projects")
            self.assertEqual(status, 500)
            self.assertEqual(body["error"], "Something went wrong on our side. Please try again in a moment.")
            sources = [(e["source"], e["message"]) for e in app.storage.list_errors()]
            self.assertIn(("browser", "TypeError in panel"), sources)
            self.assertIn(("server", "ZeroDivisionError: division by zero"), sources)

    def test_local_mode_still_works_and_records_owner_ownership(self):
        from server_fixture import running_server
        with running_server() as (app, base):
            self.assertEqual(http(base, "/api/projects", "POST", {"id": "owner-site"})[0], 201)
            self.assertIn("owner-site", http(base, "/api/projects")[1])
            self.assertEqual(app.storage.owner_of("project", "owner-site"), storagemod.OWNER_ID)
            self.assertEqual(app.storage_warning, None)


if __name__ == "__main__":
    unittest.main()
