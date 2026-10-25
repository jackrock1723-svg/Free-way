"""Step 6: admin API, admin token script, ADMIN_EMAILS access."""
from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server_fixture
from server_fixture import E2E_ADMIN_TOKEN, running_server
from freecode import admin_token


def http(base, path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(base + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


ADMIN = {"X-Admin-Token": E2E_ADMIN_TOKEN}


class AdminTokenScriptTests(unittest.TestCase):
    def test_script_writes_file_stores_only_hash_and_prints_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "handoff" / "ADMIN_ACCESS.txt"
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), patch.dict(os.environ, {}, clear=False):
                os.environ.pop(admin_token.HASH_ENV, None)
                self.assertEqual(admin_token.main(["--data", d, "--out", str(out), "--url", "https://freeway.example"]), 0)
                token = next(line for line in out.read_text(encoding="utf-8").splitlines() if line.startswith("fwadm_"))
                self.assertEqual((stdout.getvalue(), stderr.getvalue()), ("", ""))
                stored = admin_token.hash_file(d).read_text(encoding="ascii")
                self.assertNotIn(token, stored)
                self.assertTrue(admin_token.token_matches(d, token))
                self.assertFalse(admin_token.token_matches(d, token + "x"))
                self.assertFalse(admin_token.token_matches(d, None))
                self.assertIn("https://freeway.example/#admin", out.read_text(encoding="utf-8"))


class AdminApiTests(unittest.TestCase):
    def test_admin_endpoints_require_token(self):
        with running_server() as (app, base):
            self.assertEqual(http(base, "/api/admin/whoami")[1]["admin"], False)
            self.assertEqual(http(base, "/api/admin/whoami", headers=ADMIN)[1]["via"], "token")
            for path in ("/api/admin/overview", "/api/admin/users", "/api/admin/errors", "/api/admin/ads-stats", "/api/admin/users/owner"):
                status, body = http(base, path)
                self.assertEqual(status, 403, path)
                self.assertEqual(body["error"], "Admin access required.")
                self.assertEqual(http(base, path, headers=ADMIN)[0], 200, path)
            self.assertEqual(http(base, "/api/admin/users/owner/disable", "POST", {}, {"X-Admin-Token": "wrong-token-0123456789"})[0], 403)

    def test_overview_users_disable_enable_and_errors(self):
        with running_server() as (app, base):
            user = app.storage.upsert_user("sub-z", "z@example.com", "Zed")
            app.storage.log_error("server", "kaboom", path="/api/x")
            status, overview = http(base, "/api/admin/overview", headers=ADMIN)
            self.assertEqual(status, 200)
            self.assertTrue(overview["health"]["ok"])
            self.assertEqual(overview["health"]["storage"], "local")
            self.assertIn("available", overview["sandbox"])
            self.assertIn("mode", overview["agents"])
            emails = [u["email"] for u in http(base, "/api/admin/users", headers=ADMIN)[1]]
            self.assertIn("z@example.com", emails)
            self.assertTrue(http(base, f"/api/admin/users/{user['id']}/disable", "POST", {}, ADMIN)[1]["disabled"])
            self.assertFalse(http(base, f"/api/admin/users/{user['id']}/enable", "POST", {}, ADMIN)[1]["disabled"])
            self.assertEqual(http(base, "/api/admin/users/owner/disable", "POST", {}, ADMIN)[0], 400)
            self.assertEqual(http(base, "/api/admin/users/nobody", headers=ADMIN)[0], 404)
            self.assertEqual(http(base, "/api/admin/errors", headers=ADMIN)[1][0]["message"], "kaboom")


class AdminEmailTests(unittest.TestCase):
    def test_admin_emails_grant_access_to_signed_in_google_user(self):
        from test_storage_accounts import MultiUserServerTests
        with patch.dict(os.environ, {"ADMIN_EMAILS": "Boss@Example.com, other@example.com"}):
            case = MultiUserServerTests("test_logins_are_recorded_and_users_are_isolated")
            case.setUp()
            try:
                _, boss = case.sign_in("sub-boss", "boss@example.com")
                _, pleb = case.sign_in("sub-pleb", "pleb@example.com")
                self.assertEqual(http(case.base, "/api/admin/whoami", headers=boss)[1]["via"], "email")
                self.assertEqual(http(case.base, "/api/admin/users", headers=boss)[0], 200)
                self.assertEqual(http(case.base, "/api/admin/users", headers=pleb)[0], 403)
                self.assertEqual(http(case.base, "/api/admin/revenue", headers=pleb)[0], 403)
            finally:
                case.doCleanups()


if __name__ == "__main__":
    unittest.main()
