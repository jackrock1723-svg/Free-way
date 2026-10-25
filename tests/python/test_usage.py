from __future__ import annotations

import inspect
import io
import json
import tempfile
import time
import unittest
from unittest.mock import patch
from contextlib import redirect_stderr
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from freecode.providers import OpenAICompatProvider, Router
from server_fixture import running_server

try:
    from freecode.usage import UsageStore
except ImportError:
    UsageStore = None


FAKE_KEY = "synthetic-task9-key-not-a-real-credential"
FAKE_PROMPT = "synthetic prompt that must never be persisted"


class FakeHeaders(dict):
    def get(self, key, default=None):
        return super().get(key, default)


class FakeStreamResponse:
    def __init__(self, events):
        self.headers = FakeHeaders({"Content-Type": "text/event-stream"})
        self.lines = [
            ("data: " + json.dumps(event) + "\n\n").encode("utf-8")
            for event in events
        ] + [b"data: [DONE]\n\n"]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def __iter__(self):
        return iter(self.lines)


class FakeStreamOpener:
    def __init__(self, events):
        self.events = events
        self.request = None

    def __call__(self, request, timeout=None):
        self.request = request
        return FakeStreamResponse(self.events)


def get_json(url):
    try:
        with urlopen(url, timeout=3) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


class UsageStoreTests(unittest.TestCase):
    def make_store(self, directory, clock):
        self.assertIsNotNone(UsageStore, "UsageStore is not implemented")
        return UsageStore(directory, clock=clock)

    def test_record_keeps_only_upstream_fields_and_filters_periods(self):
        now = 2_000_000_000
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory, lambda: now)
            self.assertTrue(store.record({
                "input_tokens": 12,
                "output_tokens": 8,
                "route": "openrouter",
                "model": "upstream-model-a",
                "time": now - 3_600,
                "prompt": FAKE_PROMPT,
                "api_key": FAKE_KEY,
                "cost_usd": 18.25,
                "credits": 9,
            }))
            self.assertTrue(store.record({
                "input_tokens": 3,
                "output_tokens": 2,
                "route": "nvidia-nim",
                "model": "upstream-model-b",
                "time": now - 35 * 86_400,
            }))

            week = store.query("7d")
            month = store.query("30d")
            all_time = store.query("all")
            self.assertTrue(week["available"])
            self.assertEqual(week["requests"], 1)
            self.assertEqual(week["input_tokens"], 12)
            self.assertEqual(week["output_tokens"], 8)
            self.assertEqual(week["total_tokens"], 20)
            self.assertEqual(month["requests"], 1)
            self.assertEqual(all_time["requests"], 2)
            self.assertEqual(all_time["input_tokens"], 15)
            self.assertEqual(all_time["output_tokens"], 10)
            self.assertEqual(all_time["total_tokens"], 25)
            self.assertIsNone(week["cost_usd"])
            self.assertIsNone(week["credits"])

            stored = (Path(directory) / "usage.json").read_text(encoding="utf-8")
            self.assertNotIn(FAKE_PROMPT, stored)
            self.assertNotIn(FAKE_KEY, stored)
            self.assertNotIn("cost_usd", stored)
            self.assertNotIn("18.25", stored)
            self.assertNotIn("credits", stored)

    def test_history_is_bounded_to_latest_1000_records(self):
        limit = 1_000
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory, lambda: 2_000_000_000)
            events = [
                {"input_tokens": 1, "output_tokens": 0, "total_tokens": 1,
                 "route": "openrouter", "model": f"model-{index}", "time": None}
                for index in range(limit)
            ]
            path = Path(directory) / "usage.json"
            path.write_text(json.dumps({"schema_version": 1, "events": events}), encoding="utf-8")

            self.assertTrue(store.record({
                "input_tokens": 1, "output_tokens": 0, "total_tokens": 1,
                "route": "openrouter", "model": "model-new", "time": None,
            }))
            saved = json.loads(path.read_text(encoding="utf-8"))
            report = store.query("all")
            self.assertEqual(len(saved["events"]), limit)
            self.assertEqual(saved["events"][0]["model"], "model-1")
            self.assertEqual(saved["events"][-1]["model"], "model-new")
            self.assertEqual(report["requests"], limit)
            self.assertEqual(report["history_limit"], limit)

    def test_oversized_store_is_unavailable_and_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "usage.json"
            payload = json.dumps({"schema_version": 1, "events": []}) + (" " * 2_000_000)
            path.write_text(payload, encoding="utf-8")
            store = self.make_store(directory, time.time)
            original_size = path.stat().st_size

            self.assertFalse(store.query("all")["available"])
            self.assertFalse(store.record({"input_tokens": 1}))
            self.assertEqual(path.stat().st_size, original_size)

    def test_missing_upstream_time_or_token_fields_stay_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory, lambda: 2_000_000_000)
            self.assertTrue(store.record({"input_tokens": 4, "route": "openrouter"}))


            week = store.query("7d")
            all_time = store.query("all")
            self.assertFalse(week["available"])
            self.assertIsNone(week["requests"])
            self.assertIsNone(week["input_tokens"])
            self.assertIn("time", week["reason"].lower())
            self.assertTrue(all_time["available"])
            self.assertEqual(all_time["input_tokens"], 4)
            self.assertIsNone(all_time["output_tokens"])
            self.assertIsNone(all_time["total_tokens"])
            self.assertIsNone(all_time["cost_usd"])

    def test_corrupt_usage_store_reports_unavailable_and_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "usage.json"
            path.write_text("{broken", encoding="utf-8")
            store = self.make_store(directory, time.time)

            report = store.query("7d")
            self.assertFalse(report["available"])
            self.assertIn("unavailable", report["reason"].lower())
            self.assertFalse(store.record({"input_tokens": 2}))
            self.assertEqual(path.read_text(encoding="utf-8"), "{broken")

    def test_unsupported_period_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory, time.time)
            with self.assertRaises(ValueError):
                store.query("forever")

    def test_router_persists_only_usage_metadata_returned_by_upstream(self):
        self.assertIsNotNone(UsageStore, "UsageStore is not implemented")
        self.assertIn("on_usage", inspect.signature(Router.__init__).parameters)
        self.assertIn("on_usage", inspect.signature(OpenAICompatProvider.complete).parameters)
        now = int(time.time())
        upstream_events = [
            {"choices": [{"delta": {"content": "answer"}, "finish_reason": None}]},
            {
                "model": "upstream-model",
                "created": now,
                "route": "openrouter",
                "usage": {"prompt_tokens": 13, "completion_tokens": 5, "total_tokens": 18},
                "choices": [],
            },
        ]
        opener = FakeStreamOpener(upstream_events)

        with tempfile.TemporaryDirectory() as directory:
            store = UsageStore(directory)
            provider = OpenAICompatProvider(
                "openrouter",
                url="https://provider.invalid/chat/completions",
                opener=opener,
            )
            router = Router(
                keys={"openrouter": FAKE_KEY},
                providers={"openrouter": provider},
                on_usage=store.record,
            )
            answer, route = router.complete("forge", [{"role": "user", "content": FAKE_PROMPT}])

            self.assertEqual(answer, "answer")
            self.assertEqual(route["provider"], "openrouter")
            report = store.query("all")
            self.assertTrue(report["available"])
            self.assertEqual(report["input_tokens"], 13)
            self.assertEqual(report["output_tokens"], 5)
            self.assertEqual(report["total_tokens"], 18)
            stored = (Path(directory) / "usage.json").read_text(encoding="utf-8")
            self.assertNotIn(FAKE_PROMPT, stored)
            self.assertNotIn(FAKE_KEY, stored)

    def test_strict_free_remains_the_eighth_positional_argument(self):
        provider = OpenAICompatProvider("openrouter")
        with patch.object(provider, "_stream", return_value="safe") as stream:
            answer = provider.complete("upstream/model:free", [], FAKE_KEY, 90, 360, 1200, None, True)

        self.assertEqual(answer, "safe")
        self.assertTrue(stream.call_args.kwargs["strict_free"])


class UsageApiTests(unittest.TestCase):
    def test_usage_and_provider_endpoints_are_read_only_and_secret_free(self):
        with running_server() as (app, base_url):
            app.keys["openrouter"] = FAKE_KEY
            log = io.StringIO()
            with redirect_stderr(log):
                usage_status, usage = get_json(base_url + "/api/settings/usage?period=7d")
                provider_status, providers = get_json(base_url + "/api/settings/providers")

            self.assertEqual(usage_status, 200)
            self.assertEqual(provider_status, 200)
            self.assertFalse(usage["available"])
            self.assertIsNone(usage["input_tokens"])
            self.assertIsNone(usage["cost_usd"])
            self.assertIsInstance(providers, dict)
            self.assertEqual(
                [item["name"] for item in providers["providers"]],
                ["OpenRouter", "NVIDIA NIM", "Groq", "GitHub Models", "Mistral", "Cloudflare AI"],
            )
            self.assertTrue(providers["providers"][0]["configured"])
            for item in providers["providers"]:
                self.assertEqual(set(item), {"name", "configured"})
                self.assertIs(type(item["configured"]), bool)
            self.assertNotIn(FAKE_KEY, json.dumps(providers))
            self.assertNotIn(FAKE_KEY, log.getvalue())

    def test_invalid_usage_period_returns_a_clear_bad_request(self):
        with running_server() as (_app, base_url):
            status, payload = get_json(base_url + "/api/settings/usage?period=forever")

        self.assertEqual(status, 400)
        self.assertEqual(payload.get("error"), "unsupported usage period")

    def test_auth_stays_disabled_and_supported_connector_catalog_is_real(self):
        with running_server() as (_app, base_url):
            status, auth = get_json(base_url + "/api/auth/config")
            self.assertEqual(status, 200)
            self.assertFalse(auth["enabled"])

            status, connectors = get_json(base_url + "/api/connectors")
            self.assertEqual(status, 200)
            supported_ids = {item["id"] for item in connectors}
            self.assertTrue({"gmail", "gdrive", "gcal", "slack", "notion", "linear", "outlook"}.issubset(supported_ids))
            self.assertNotIn("posthog", supported_ids)
            self.assertNotIn("sentry", supported_ids)
            self.assertNotIn("stripe", supported_ids)
            self.assertNotIn("supabase", supported_ids)
            self.assertNotIn("hubspot", supported_ids)


if __name__ == "__main__":
    unittest.main()
