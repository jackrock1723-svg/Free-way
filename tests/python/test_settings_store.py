"""Offline settings-store and HTTP API contract tests."""

import json
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server_fixture import running_server

DEFAULT_SETTINGS = {"schema_version": 1, "preferences": {}}
TEST_ONLY_KEY = "test-only-never-user-secret-6d3920"


def request_json(base_url, path, method="GET", body=None, extra_headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    headers.update(extra_headers or {})
    request = Request(base_url + path, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=3) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {"error": raw}


class SettingsStoreTests(unittest.TestCase):
    def make_store(self, data_dir):
        try:
            from freecode.settings import SettingsStore
        except (ImportError, AttributeError) as error:
            self.fail(f"SettingsStore is not available yet: {error}")
        return SettingsStore(data_dir)

    def test_settings_store_returns_versioned_empty_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            self.assertEqual(store.read(), DEFAULT_SETTINGS)
            self.assertEqual(store.read_project("demo"), DEFAULT_SETTINGS)

    def test_settings_store_updates_and_merges_allowlisted_preferences(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            self.assertEqual(
                store.update({"advanced_mode": True}),
                {"schema_version": 1, "preferences": {"advanced_mode": True}},
            )
            self.assertEqual(
                store.update({"notification_sounds": False}),
                {
                    "schema_version": 1,
                    "preferences": {"advanced_mode": True, "notification_sounds": False},
                },
            )

    def test_settings_store_rejects_unknown_fields_without_echoing_values(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            with self.assertRaises(ValueError) as raised:
                store.update({"api_key": TEST_ONLY_KEY})

            self.assertNotIn(TEST_ONLY_KEY, str(raised.exception))
            self.assertEqual(store.read(), DEFAULT_SETTINGS)

    def test_settings_store_rejects_wrong_preference_types(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            with self.assertRaises(ValueError):
                store.update({"advanced_mode": "true"})
            self.assertEqual(store.read(), DEFAULT_SETTINGS)

    def test_settings_store_recovers_from_corrupt_json_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            original = b'{"schema_version":1,"preferences":{"advanced_mode":'
            path.write_bytes(original)
            store = self.make_store(directory)

            self.assertEqual(store.read(), DEFAULT_SETTINGS)
            self.assertEqual(path.read_bytes(), original)

    def test_settings_store_atomic_write_failure_preserves_last_valid_file(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)
            expected = store.update({"advanced_mode": True})
            path = Path(directory) / "settings.json"
            original = path.read_bytes()

            with patch("freecode.settings.os.replace", side_effect=OSError("simulated rename failure")):
                with self.assertRaises(OSError):
                    store.update({"notification_sounds": True})

            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(store.read(), expected)
            self.assertEqual(list(Path(directory).glob(".settings.json.*.tmp")), [])

    def test_settings_store_roundtrips_project_startup_text(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            saved = store.update_project("demo-1", {"startup_command": "npm run dev -- --host 127.0.0.1"})

            self.assertEqual(
                saved,
                {"schema_version": 1, "preferences": {"startup_command": "npm run dev -- --host 127.0.0.1"}},
            )
            self.assertEqual(store.read_project("demo-1"), saved)
            self.assertEqual(store.read(), DEFAULT_SETTINGS)

    def test_settings_store_rejects_invalid_project_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            for project_id in ("../outside", "Bad_ID", "has space", "a" * 49, None):
                with self.subTest(project_id=project_id):
                    with self.assertRaises(ValueError):
                        store.read_project(project_id)
                    with self.assertRaises(ValueError):
                        store.update_project(project_id, {"startup_command": "echo safe"})

    def test_settings_store_rejects_unknown_project_fields_and_bad_types(self):
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            with self.assertRaises(ValueError):
                store.update_project("demo", {"api_key": TEST_ONLY_KEY})
            with self.assertRaises(ValueError):
                store.update_project("demo", {"startup_command": True})
            self.assertEqual(store.read_project("demo"), DEFAULT_SETTINGS)

    def test_task7_preferences_are_allowlisted_and_roundtrip(self):
        shortcuts = {
            "toggle_sidebar": "Ctrl+B",
            "toggle_terminal": "Ctrl+`",
            "toggle_right_panel": "Ctrl+Alt+B",
            "search_chats": "Ctrl+K",
            "open_settings": "Ctrl+,",
            "open_project": "Ctrl+O",
            "new_chat": "Ctrl+T",
            "close_tab": "Ctrl+W",
            "next_tab": "Ctrl+Tab",
            "previous_tab": "Ctrl+Shift+Tab",
            "reopen_tab": "Ctrl+Shift+T",
        }
        patch = {
            "advanced_mode": True,
            "notification_sounds": True,
            "local_auto_archive": "7d",
            "auto_next_session": True,
            "full_access": False,
            "pre_sync_projects": False,
            "include_agents_md": True,
            "appearance_style": "shine",
            "appearance_preset": "aurora",
            "keyboard_shortcuts": shortcuts,
        }
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            self.assertEqual(store.update(patch), {"schema_version": 1, "preferences": patch})
            self.assertEqual(store.read(), {"schema_version": 1, "preferences": patch})

    def test_task7_preferences_reject_invalid_enums_types_and_colliding_shortcuts(self):
        shortcuts = {
            "toggle_sidebar": "Ctrl+B",
            "toggle_terminal": "Ctrl+`",
            "toggle_right_panel": "Ctrl+Alt+B",
            "search_chats": "Ctrl+K",
            "open_settings": "Ctrl+B",
            "open_project": "Ctrl+O",
            "new_chat": "Ctrl+T",
            "close_tab": "Ctrl+W",
            "next_tab": "Ctrl+Tab",
            "previous_tab": "Ctrl+Shift+Tab",
            "reopen_tab": "Ctrl+Shift+T",
        }
        invalid_patches = [
            {"local_auto_archive": "20 years"},
            {"appearance_style": "neon"},
            {"appearance_preset": "made-up-theme"},
            {"auto_next_session": 1},
            {"keyboard_shortcuts": shortcuts},
        ]
        with tempfile.TemporaryDirectory() as directory:
            store = self.make_store(directory)

            for patch in invalid_patches:
                with self.subTest(patch=patch):
                    with self.assertRaises(ValueError):
                        store.update(patch)
                    self.assertEqual(store.read(), DEFAULT_SETTINGS)


class SettingsApiTests(unittest.TestCase):
    def test_settings_api_reads_and_persists_global_preferences(self):
        with running_server() as (_, base_url):
            status, body = request_json(base_url, "/api/settings")
            self.assertEqual(status, 200)
            self.assertEqual(body, DEFAULT_SETTINGS)

            status, body = request_json(base_url, "/api/settings", "PUT", {"advanced_mode": True})
            self.assertEqual(status, 200)
            self.assertEqual(body, {"schema_version": 1, "preferences": {"advanced_mode": True}})

            status, body = request_json(base_url, "/api/settings")
            self.assertEqual(status, 200)
            self.assertEqual(body, {"schema_version": 1, "preferences": {"advanced_mode": True}})

    def test_settings_api_reads_and_persists_project_preferences(self):
        with running_server() as (_, base_url):
            path = "/api/settings/projects/demo"
            status, body = request_json(base_url, path)
            self.assertEqual(status, 200)
            self.assertEqual(body, DEFAULT_SETTINGS)

            status, body = request_json(
                base_url,
                path,
                "PUT",
                {"startup_command": "npm run dev"},
            )
            self.assertEqual(status, 200)
            self.assertEqual(body, {"schema_version": 1, "preferences": {"startup_command": "npm run dev"}})
            self.assertEqual(request_json(base_url, path), (200, body))

            status, error = request_json(base_url, "/api/settings/projects/BAD")
            self.assertEqual(status, 400)
            self.assertIsInstance(error.get("error"), str)

    def test_settings_api_rejects_secret_fields_without_disclosing_values(self):
        with running_server() as (app, base_url):
            app.keys["openrouter"] = TEST_ONLY_KEY

            status, body = request_json(base_url, "/api/settings")
            self.assertEqual(status, 200)
            self.assertNotIn(TEST_ONLY_KEY, json.dumps(body))
            self.assertNotIn("keys", body)
            self.assertNotIn("api_key", body)

            status, error = request_json(base_url, "/api/settings", "PUT", {"api_key": TEST_ONLY_KEY})
            self.assertEqual(status, 400)
            self.assertNotIn(TEST_ONLY_KEY, json.dumps(error))
            self.assertNotIn(TEST_ONLY_KEY, json.dumps(request_json(base_url, "/api/settings")[1]))

    def test_settings_api_persists_task7_preferences(self):
        patch = {
            "appearance_style": "3d",
            "appearance_preset": "aurora",
            "local_auto_archive": "7d",
            "full_access": False,
        }
        with running_server() as (_, base_url):
            status, body = request_json(base_url, "/api/settings", "PUT", patch)
            self.assertEqual(status, 200)
            self.assertEqual(body, {"schema_version": 1, "preferences": patch})
            self.assertEqual(request_json(base_url, "/api/settings"), (200, body))

    def test_settings_put_requires_csrf_for_an_authenticated_cookie_session(self):
        with running_server() as (app, base_url):
            fake_auth = SimpleNamespace(
                SESSION_COOKIE_NAME="fc-test-session",
                get_session=lambda session_id: object() if session_id == "valid-test-session" else None,
                config=SimpleNamespace(enabled=True, client_id=None),
            )
            app.owner_auth = fake_auth
            app.google_auth_config = fake_auth.config

            status, _ = request_json(
                base_url,
                "/api/settings",
                "PUT",
                {"advanced_mode": True},
                extra_headers={
                    "Cookie": "fc-test-session=valid-test-session",
                    "Origin": "https://freecode.test",
                },
            )

            self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
