"""Characterization checks for the verified v18 baseline."""

import json
import unittest
from urllib.request import urlopen

from server_fixture import running_server


class V18BaselineTests(unittest.TestCase):
    def test_local_server_serves_health_and_auth_disabled(self):
        with running_server() as (app, base_url):
            with urlopen(f"{base_url}/api/health", timeout=3) as response:
                self.assertEqual(response.status, 200)
                health = json.loads(response.read())
            self.assertTrue(health["ok"])
            self.assertEqual(health["mode"], "local")
            self.assertIsInstance(health["version"], str)

            with urlopen(f"{base_url}/api/auth/config", timeout=3) as response:
                auth = json.loads(response.read())
            self.assertFalse(auth["enabled"])
            self.assertIsNone(auth["client_id"])
            self.assertFalse(app.google_auth_config.enabled)

    def test_legacy_homepage_loads_without_provider_calls(self):
        with running_server() as (app, base_url):
            mock = app.router.mock
            calls_before = mock.calls
            with urlopen(f"{base_url}/", timeout=3) as response:
                self.assertEqual(response.status, 200)
                self.assertIn("text/html", response.headers.get("Content-Type", ""))
                html = response.read().decode("utf-8")
            self.assertIn("<title>Free way</title>", html)
            self.assertEqual(mock.calls, calls_before)


if __name__ == "__main__":
    unittest.main()
