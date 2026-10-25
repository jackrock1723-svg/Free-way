"""Regression tests for keeping mock ads and rewards out of normal mode."""

import json
import os
import re
import tempfile
import unittest
from unittest.mock import patch

from freecode.ads import BENEFITS, MockAdapter
from freecode.server import App


class AdsProductionGuardTests(unittest.TestCase):
    def make_app(self, data_dir, *, mock=False):
        env = {
            "FC_GOOGLE_AUTH": "off",
            "FC_MCP": "0",
            "FC_ADS": "on",
            "FC_ADS_NETWORK": "",
        }
        with patch.dict(os.environ, env):
            return App(data_dir, mode="local", token=None, mock=mock)

    def test_normal_mode_without_publisher_never_serves_mock_inventory(self):
        with tempfile.TemporaryDirectory(prefix="freecode-ads-normal-") as data_dir:
            app = self.make_app(data_dir)

            result = app.ads.next_ad("owner", "deploy and test a server", agent_state="review")

            self.assertIsNone(result["ad"])
            self.assertEqual(result["reason"], "ad publisher unavailable")

    def test_normal_mode_does_not_advertise_or_grant_unfunded_rewards(self):
        with tempfile.TemporaryDirectory(prefix="freecode-ads-rewards-") as data_dir:
            app = self.make_app(data_dir)
            consent = app.ads.consent("owner")

            self.assertFalse(consent["available"])
            self.assertIsNone(consent["benefits"])
            self.assertIsNone(consent["credits"])
            self.assertIsNone(consent["bonus_daily_runs"])
            self.assertNotRegex(consent["text"], re.compile(r"bonus free credits|extra free runs", re.I))
            with self.assertRaisesRegex(ValueError, "unavailable"):
                app.ads.set_consent("owner", True, consent["current_version"])

            exported = app.ads.export("owner")
            self.assertEqual(exported["credits"], 0)
            self.assertEqual(app.ads.entries(), [])

    def test_explicit_mock_mode_keeps_deterministic_inventory_and_demo_benefits(self):
        with tempfile.TemporaryDirectory(prefix="freecode-ads-mock-a-") as first_dir, \
                tempfile.TemporaryDirectory(prefix="freecode-ads-mock-b-") as second_dir:
            first = self.make_app(first_dir, mock=True)
            second = self.make_app(second_dir, mock=True)
            self.assertIsInstance(first.ads.adapter, MockAdapter)
            self.assertIsInstance(second.ads.adapter, MockAdapter)

            first_result = first.ads.next_ad("owner", "deploy and test a server", run_key="run-1", agent_state="review")
            second_result = second.ads.next_ad("owner", "deploy and test a server", run_key="run-1", agent_state="review")
            self.assertIsNotNone(first_result["ad"])
            self.assertEqual(
                {key: first_result["ad"][key] for key in ("advertiser", "title", "url")},
                {key: second_result["ad"][key] for key in ("advertiser", "title", "url")},
            )

            consent = first.ads.consent("owner")
            self.assertTrue(consent["available"])
            self.assertEqual(consent["benefits"], BENEFITS)
            granted = first.ads.set_consent("owner", True, consent["current_version"])
            self.assertEqual(granted["credits"], 50)
            self.assertEqual(granted["bonus_daily_runs"], 25)

    def test_stale_consent_version_is_revoked_before_personalization_resumes(self):
        with tempfile.TemporaryDirectory(prefix="freecode-ads-stale-consent-") as data_dir:
            ads_dir = os.path.join(data_dir, "ads")
            os.makedirs(ads_dir)
            legacy_state = {
                "cfg": {},
                "users": {
                    "owner": {
                        "consent": {"personalized": True, "version": "2026-10-21", "at": 1, "history": []},
                        "interests": {"testing": 2},
                        "credits": 0,
                        "bonus_granted": False,
                        "shown": [],
                        "runs": {},
                        "anon": "legacy-owner",
                    }
                },
                "imps": {},
                "seq": 0,
            }
            with open(os.path.join(ads_dir, "state.json"), "w", encoding="utf-8") as state_file:
                json.dump(legacy_state, state_file)
            app = self.make_app(data_dir, mock=True)

            app.ads.note_task("owner", "hosting testing deployment")
            consent = app.ads.consent("owner")
            self.assertFalse(consent["personalized"])
            self.assertEqual(consent["interests"], [])
            self.assertEqual(app.ads.export("owner")["interests"], {})

            renewed = app.ads.set_consent("owner", True, consent["current_version"])
            self.assertTrue(renewed["personalized"])
            self.assertEqual(renewed["version"], consent["current_version"])

    def test_unconfigured_service_keeps_withdrawal_export_and_delete_available(self):
        with tempfile.TemporaryDirectory(prefix="freecode-ads-data-") as data_dir:
            ads_dir = os.path.join(data_dir, "ads")
            os.makedirs(ads_dir)
            legacy_state = {
                "cfg": {},
                "users": {
                    "owner": {
                        "consent": {"personalized": True, "version": "2026-10-21", "at": 1, "history": []},
                        "interests": {"testing": 2},
                        "credits": 50,
                        "bonus_granted": True,
                        "shown": [{"at": 1, "category": "testing"}],
                        "runs": {"run-1": 1},
                        "anon": "legacy-owner",
                    }
                },
                "imps": {},
                "seq": 0,
            }
            with open(os.path.join(ads_dir, "state.json"), "w", encoding="utf-8") as state_file:
                json.dump(legacy_state, state_file)
            app = self.make_app(data_dir)

            withdrawn = app.ads.set_consent("owner", False)
            self.assertFalse(withdrawn["personalized"])
            self.assertEqual(withdrawn["interests"], [])
            exported = app.ads.export("owner")
            self.assertIn("consent", exported)
            self.assertEqual(exported["interests"], {})
            self.assertEqual(exported["ads_shown"], [{"at": 1, "category": "testing"}])

            erased = app.ads.erase("owner")
            self.assertFalse(erased["personalized"])
            self.assertEqual(app.ads.export("owner")["ads_shown"], [])


if __name__ == "__main__":
    unittest.main()
