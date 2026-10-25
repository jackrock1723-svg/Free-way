"""Step 7: Ads v2 - stack-aware targeting, secret redaction, privacy choice, caps, admin controls, per-user events."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server_fixture  # noqa: F401  (offline defaults + test admin token)
from server_fixture import E2E_ADMIN_TOKEN
from freecode import ads
from freecode.ad_targeting import StackCache, stack_signals

# Fake credentials are assembled at runtime so the release scan never sees a credential-shaped literal.
FAKE_AWS = "AK" + "IA" + "ABCDEFGHIJKLMNOP"
FAKE_GH = "gh" + "p_" + "abcdefghijklmnopqrstuvwxyz0123456789"
FAKE_GOOGLE = "AI" + "za" + "SyA1234567890abcdefghijklmnopqrstu"
SECRETS = ["hunter2-password", FAKE_AWS, "postgres://admin:s3cretpw@db.internal:5432/app",
           "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk", FAKE_GH,
           "boss@example.com", "10.1.2.3", "sk-live_abcdefghijklmnop", FAKE_GOOGLE]
SECRET_CONTEXT = ("deploy my postgres database password=hunter2-password key " + FAKE_AWS + " url postgres://admin:s3cretpw@db.internal:5432/app "
                  "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk token " + FAKE_GH + " "
                  "mail boss@example.com host 10.1.2.3 stripe sk-live_abcdefghijklmnop google " + FAKE_GOOGLE)


def make_project(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "package.json").write_text(json.dumps({"dependencies": {"react": "^18", "pg": "^8", "stripe": "^14", "acme-internal-billing-secret": "1.0"},
                                                    "devDependencies": {"jest": "^29"}}), encoding="utf-8")
    (root / "requirements.txt").write_text("fastapi==0.110\nsqlalchemy>=2\n# comment\nmy-private-lib==1\n", encoding="utf-8")
    (root / "src").mkdir(exist_ok=True)
    (root / "src" / "app.jsx").write_text("export default function App() { return null }\n", encoding="utf-8")
    (root / "src" / "api.py").write_text("API_KEY = 'sk-live_abcdefghijklmnop'\n", encoding="utf-8")
    (root / ".env").write_text("DATABASE_URL=postgres://admin:s3cretpw@db.internal:5432/app\n", encoding="utf-8")
    (root / "Dockerfile").write_text("FROM python:3.12\n", encoding="utf-8")
    return root


class StackSignalTests(unittest.TestCase):
    def test_stack_signals_are_allow_listed_names_only(self):
        with tempfile.TemporaryDirectory() as d:
            stack = stack_signals(make_project(Path(d) / "p"))
            self.assertIn("JavaScript", stack["languages"])
            self.assertIn("Python", stack["languages"])
            for name in ("React", "Postgres", "Stripe", "Jest", "FastAPI", "SQLAlchemy", "Docker"):
                self.assertIn(name, stack["frameworks"])
            text = json.dumps(stack)
            for leaked in ("acme", "my-private-lib", "s3cretpw", "sk-live", "api.py", ".env"):
                self.assertNotIn(leaked, text)
            self.assertEqual(stack["categories"]["databases"], 1.0)
            self.assertIn("payments", stack["categories"])

    def test_missing_project_and_cache(self):
        self.assertEqual(stack_signals("/definitely/not/here")["frameworks"], [])
        with tempfile.TemporaryDirectory() as d:
            root = make_project(Path(d) / "p")
            cache = StackCache(ttl=60)
            first = cache.get("p", root)
            (root / "package.json").write_text("{}", encoding="utf-8")
            self.assertEqual(cache.get("p", root), first)

    def test_relevance_scoring_combines_task_and_stack(self):
        stack = {"categories": {"databases": 1.0, "payments": 0.5}}
        scores = dict(ads.score_categories("make the page prettier", stack, 0.6))
        self.assertAlmostEqual(scores["databases"], 0.6)
        self.assertAlmostEqual(scores["payments"], 0.3)
        both = dict(ads.score_categories("add a postgres database table", stack, 0.6))
        self.assertGreater(both["databases"], scores["databases"])
        self.assertEqual(dict(ads.score_categories("make the page prettier", None)).get("databases"), None)

    def test_redaction_removes_secrets_keys_and_contacts(self):
        cleaned = ads.redact(SECRET_CONTEXT, limit=2000)
        for secret in SECRETS:
            self.assertNotIn(secret, cleaned)
        self.assertNotIn("s3cretpw", cleaned)
        self.assertIn("deploy my postgres database", cleaned)


class AdServiceV2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.now = [1_000_000.0]
        self.adapter = ads.MockAdapter()
        self.svc = ads.AdService(Path(self.tmp.name) / "ads", adapter=self.adapter, clock=lambda: self.now[0])
        self.svc.set_config(min_gap_s=0)
        self.stack = stack_signals(make_project(Path(self.tmp.name) / "proj"))

    def test_payload_has_stack_names_but_no_secrets(self):
        result = self.svc.next_ad("u1", SECRET_CONTEXT, "chat", run_key="r1", stack=self.stack)
        self.assertIsNotNone(result["ad"], result)
        sent = json.dumps(self.adapter.requests)
        for secret in SECRETS + ["s3cretpw", "acme", "my-private-lib"]:
            self.assertNotIn(secret, sent)
        self.assertIn("React", sent)
        self.assertIn("project's stack", result["ad"]["why"])
        signals = self.svc.signals()[0]
        self.assertEqual(signals["user_id"], "u1")
        self.assertIn("React", signals["frameworks"])

    def test_stack_alone_can_target_and_privacy_off_disables_it(self):
        self.assertIsNotNone(self.svc.next_ad("u2", "make it nicer please", "board", stack=self.stack)["ad"])
        self.assertTrue(self.svc.privacy("u2")["use_stack"])
        self.assertIn("never sent to an ad network", self.svc.privacy("u2")["notice"])
        self.svc.set_privacy("u2", False)
        self.now[0] += 10
        self.assertEqual(self.svc.next_ad("u2", "make it nicer please", "board", stack=self.stack)["reason"], "nothing relevant")

        with self.assertRaises(ValueError):
            self.svc.set_privacy("u2", "yes")

    def test_frequency_caps_and_admin_switch(self):
        self.svc.set_config(max_per_day=1)
        self.assertIsNotNone(self.svc.next_ad("u3", "deploy to a server host", "chat")["ad"])
        self.assertEqual(self.svc.next_ad("u3", "deploy to a server host", "chat")["reason"], "daily limit")
        self.svc.set_config(max_per_day=10, min_gap_s=600)
        self.assertEqual(self.svc.next_ad("u3", "deploy to a server host", "chat")["reason"], "too soon")
        self.svc.set_config(enabled=0)
        self.assertEqual(self.svc.next_ad("u4", "deploy to a server host", "chat")["reason"], "ads are turned off by the admin")
        self.assertFalse(self.svc.privacy("u4")["enabled"])
        for bad in ({"enabled": 2}, {"stack_weight": 1.5}, {"max_per_day": -1}, {"nope": 1}):
            with self.assertRaises(ValueError):
                self.svc.set_config(**bad)

    def test_never_mid_work_and_close_is_counted(self):
        self.assertEqual(self.svc.next_ad("u5", "deploy server", "board", agent_state="working")["reason"], "agent is working")
        self.svc.closed("u5")
        self.assertEqual([s["closed"] for s in self.svc.signals() if s["user_id"] == "u5"], [1])


def http(base, path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(base + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class AdsServerTests(unittest.TestCase):
    def setUp(self):
        from freecode.server import App, serve
        self.tmp = tempfile.TemporaryDirectory(prefix="freeway-ads-"); self.addCleanup(self.tmp.cleanup)
        with patch.dict(os.environ, {"FC_ADS": "on", "FC_ADS_TEST_MODE": "1"}):
            self.app = App(self.tmp.name, mode="local", token=None, mock=True)
        self.httpd = serve(self.app, "127.0.0.1", 0)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close); self.addCleanup(self.httpd.shutdown)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.admin = {"X-Admin-Token": E2E_ADMIN_TOKEN}

    def test_stack_targeted_ad_events_admin_controls(self):
        self.assertEqual(http(self.base, "/api/projects", "POST", {"id": "shop"})[0], 201)
        make_project(self.app.ws.project_dir("shop"))
        self.assertEqual(http(self.base, "/api/admin/ads/config", "POST", {"min_gap_s": 0}, self.admin)[0], 200)
        status, result = http(self.base, "/api/ads/next", "POST", {"placement": "chat", "project": "shop", "context": "make it nicer " + SECRET_CONTEXT})
        self.assertEqual(status, 200)
        ad = result["ad"]
        self.assertIn("project's stack", ad["why"])
        sent = json.dumps(self.app.ads.adapter.requests)
        for secret in SECRETS:
            self.assertNotIn(secret, sent)
        for kind in ("view", "click", "close"):
            self.assertEqual(http(self.base, "/api/ads/event", "POST", {"id": ad["id"], "sig": ad["sig"], "kind": kind})[0], 200)
        self.assertEqual(http(self.base, "/api/ads/event", "POST", {"id": ad["id"], "sig": "forged", "kind": "close"})[0], 402)  # existing ads mapping for a bad ad id
        summary = self.app.storage.ad_summary()
        self.assertEqual((summary.get("impression"), summary.get("view"), summary.get("click"), summary.get("close")), (1, 1, 1, 1))
        status, overview = http(self.base, "/api/admin/ads", headers=self.admin)
        self.assertEqual(status, 200)
        self.assertIn("React", overview["signals"][0]["frameworks"])
        self.assertEqual(overview["signals"][0]["closed"], 1)
        self.assertEqual(http(self.base, "/api/admin/ads", )[0], 403)
        self.assertEqual(http(self.base, "/api/admin/ads/config", "POST", {"enabled": 0}, self.admin)[1]["config"]["enabled"], 0)
        self.assertEqual(http(self.base, "/api/ads/next", "POST", {"placement": "chat", "context": "deploy server host"})[1]["reason"], "ads are turned off by the admin")
        self.assertEqual(http(self.base, "/api/admin/ads/config", "POST", {"enabled": 5}, self.admin)[0], 400)

    def test_privacy_endpoint(self):
        status, privacy = http(self.base, "/api/ads/privacy")
        self.assertEqual((status, privacy["use_stack"]), (200, True))
        self.assertFalse(http(self.base, "/api/ads/privacy", "POST", {"use_stack": False})[1]["use_stack"])
        self.assertEqual(http(self.base, "/api/ads/privacy", "POST", {"use_stack": "x"})[0], 400)


if __name__ == "__main__":
    unittest.main()
