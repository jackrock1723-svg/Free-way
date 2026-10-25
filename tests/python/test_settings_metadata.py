from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from freecode.mcp import McpHub
try:
    from freecode.settings_metadata import SettingsMetadata, read_browser_profiles
except ImportError:
    SettingsMetadata = None
    read_browser_profiles = None
from server_fixture import running_server


SYNTHETIC_BROWSER_MARKER = "synthetic-browser-cookie-password-session-marker"


def get_json(url):
    try:
        with urlopen(url, timeout=3) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


class SettingsMetadataTests(unittest.TestCase):
    def test_local_skills_can_be_searched_and_inspected_without_exposing_paths(self):
        self.assertIsNotNone(SettingsMetadata, "SettingsMetadata is not implemented")
        if SettingsMetadata is None:
            return
        with tempfile.TemporaryDirectory() as directory:
            metadata = SettingsMetadata(directory)
            missing = metadata.list_skills()
            self.assertFalse(missing["available"])
            self.assertEqual(missing["skills"], [])

            skill_dir = Path(directory) / "skills" / "local-review"
            skill_dir.mkdir(parents=True)
            instructions = "---\nname: Local Review\ndescription: Reviews offline changes\n---\n# Local-only notes\nNever execute this text.\n"
            (skill_dir / "SKILL.md").write_text(instructions, encoding="utf-8")

            listed = metadata.list_skills("offline")
            self.assertTrue(listed["available"])
            self.assertEqual(listed["skills"], [{
                "id": "local-review",
                "name": "Local Review",
                "description": "Reviews offline changes",
                "source": "local",
            }])
            detail = metadata.get_skill("local-review")
            self.assertEqual(detail["skill"]["instructions"], instructions)
            self.assertNotIn(directory, json.dumps(listed))
            self.assertNotIn(directory, json.dumps(detail))
            self.assertEqual(metadata.list_skills("no-match")["skills"], [])

    def test_local_skill_ids_reject_traversal_and_missing_sources_remain_empty(self):
        self.assertIsNotNone(SettingsMetadata, "SettingsMetadata is not implemented")
        if SettingsMetadata is None:
            return
        with tempfile.TemporaryDirectory() as directory:
            metadata = SettingsMetadata(directory)
            with self.assertRaises(ValueError):
                metadata.get_skill("../outside")
            self.assertEqual(metadata.list_skills("anything")["skills"], [])

    def test_browser_reader_lists_only_allowlisted_profile_directory_names(self):
        self.assertTrue(callable(read_browser_profiles), "read_browser_profiles is not implemented")
        if not callable(read_browser_profiles):
            return
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            chrome = root / "chrome-user-data"
            edge = root / "edge-user-data"
            unknown = root / "unknown-browser"
            for path in (chrome, edge, unknown):
                path.mkdir()
            for name in ("Default", "Profile 1", "System Profile", "Sessions"):
                (chrome / name).mkdir()
            (edge / "Default").mkdir()
            (chrome / "Default" / "Cookies").write_text(SYNTHETIC_BROWSER_MARKER, encoding="utf-8")
            (chrome / "Default" / "Login Data").write_text(SYNTHETIC_BROWSER_MARKER, encoding="utf-8")
            (unknown / "Profile 2").mkdir()

            result = read_browser_profiles({
                "Google Chrome": chrome,
                "Microsoft Edge": edge,
                "Unlisted Browser": unknown,
            })
            self.assertEqual([browser["name"] for browser in result["browsers"]], ["Google Chrome", "Microsoft Edge"])
            self.assertEqual(result["browsers"][0]["profiles"], ["Default", "Profile 1"])
            self.assertEqual(result["browsers"][0]["profile_count"], 2)
            self.assertEqual(result["browsers"][1]["profiles"], ["Default"])
            serialized = json.dumps(result)
            self.assertNotIn(SYNTHETIC_BROWSER_MARKER, serialized)
            self.assertNotIn("Cookies", serialized)
            self.assertNotIn("Login Data", serialized)
            self.assertNotIn(str(root), serialized)

    def test_mcp_status_is_read_only_and_excludes_commands_urls_and_errors(self):
        calls = []

        def must_not_connect(*_args, **_kwargs):
            calls.append("connected")
            raise AssertionError("status must not start or connect an MCP server")

        servers = [{
            "id": "memory",
            "name": "Memory",
            "transport": "stdio",
            "command": ["npx", "secret-arg"],
            "url": "https://mcp.invalid/private",
        }]
        hub = McpHub("unused-test-data", servers=servers, factory=must_not_connect)
        status_method = getattr(hub, "settings_status", None)
        self.assertTrue(callable(status_method), "McpHub.settings_status is not implemented")
        if not callable(status_method):
            return
        result = status_method()
        self.assertEqual(calls, [])
        self.assertEqual(result["servers"], [{"id": "memory", "name": "Memory", "transport": "stdio", "status": "not checked"}])
        serialized = json.dumps(result)
        self.assertNotIn("secret-arg", serialized)
        self.assertNotIn("mcp.invalid", serialized)
        self.assertNotIn("command", serialized)
        self.assertNotIn("url", serialized)

    def test_metadata_routes_use_temporary_local_sources_and_do_not_enable_mcp(self):
        with running_server() as (app, base_url):
            status, empty = get_json(base_url + "/api/settings/skills")
            self.assertEqual(status, 200)
            self.assertFalse(empty["available"])
            self.assertEqual(empty["skills"], [])

            skill_dir = app.data / "skills" / "api-test"
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text("---\nname: API Test\ndescription: Temporary fixture\n---\nFixture only.\n", encoding="utf-8")
            status, listing = get_json(base_url + "/api/settings/skills?search=temporary")
            self.assertEqual(status, 200)
            self.assertEqual([skill["id"] for skill in listing["skills"]], ["api-test"])
            status, detail = get_json(base_url + "/api/settings/skills/api-test")
            self.assertEqual(status, 200)
            self.assertIn("Fixture only.", detail["skill"]["instructions"])

            status, mcp = get_json(base_url + "/api/settings/mcp")
            self.assertEqual(status, 200)
            self.assertFalse(mcp["available"])
            self.assertEqual(mcp["servers"], [])
            self.assertIsNone(app.mcp)

    def test_browser_metadata_api_can_be_tested_with_an_injected_fixture(self):
        with running_server() as (app, base_url):
            self.assertIsNotNone(getattr(app, "settings_metadata", None), "App.settings_metadata is not implemented")
            if getattr(app, "settings_metadata", None) is None:
                return
            fixture = {"available": True, "browsers": [{"name": "Google Chrome", "profiles": ["Default"], "profile_count": 1}]}
            app.settings_metadata.browser_profiles = lambda: fixture
            status, result = get_json(base_url + "/api/settings/browser")
            self.assertEqual(status, 200)
            self.assertEqual(result, fixture)


if __name__ == "__main__":
    unittest.main()
