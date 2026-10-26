"""Step 8: settings honesty. The ad stack choice has one stored home (the consent record) and AGENTS.md always reaches agent context."""
from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import server_fixture  # noqa: F401  (offline defaults)
from freecode import ads
from freecode.orchestrator import OrchestratorManager


class AdConsentSingleSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.svc = ads.AdService(Path(self.tmp.name) / "ads", adapter=ads.MockAdapter(), clock=lambda: 1_000_000.0)

    def test_checkbox_value_and_downloaded_consent_always_match(self):
        for value in (None, False, True, False):
            if value is not None: self.svc.set_privacy("u1", value)
            shown = self.svc.privacy("u1")["use_stack"]
            self.assertEqual(self.svc.export("u1")["consent"]["use_stack"], shown)
            self.assertEqual(self.svc.uses_stack("u1"), shown)
        self.assertEqual(self.svc.export("u1")["consent"]["history"][-1]["use_stack"], False)

    def test_older_saved_choice_is_migrated_into_consent(self):
        self.svc.state["users"]["old"] = {"consent": {"personalized": False, "version": None, "at": None, "history": []}, "interests": {},
                                         "credits": 0, "bonus_granted": False, "shown": [], "runs": {}, "anon": "x", "privacy": {"use_stack": False}}
        self.assertFalse(self.svc.privacy("old")["use_stack"])
        self.assertFalse(self.svc.export("old")["consent"]["use_stack"])


class AgentsMdContextTests(unittest.TestCase):
    def test_agents_md_is_first_even_when_many_files_come_before_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in range(12): (root / f"a{i:02}.js").write_text(f"// file {i}\n", encoding="utf-8")
            (root / "AGENTS.md").write_text("Always use tabs.\n", encoding="utf-8")
            fake = SimpleNamespace(agents=SimpleNamespace(ws=SimpleNamespace(worktree_dir=lambda project, rid: str(root))))
            context = OrchestratorManager._read_context(fake, SimpleNamespace(project="p", id="r"))
            self.assertTrue(context.startswith("--- AGENTS.md ---\nAlways use tabs."))
            self.assertEqual(context.count("--- AGENTS.md ---"), 1)

    def test_no_agents_md_keeps_old_behaviour(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "index.html").write_text("<p>hi</p>", encoding="utf-8")
            fake = SimpleNamespace(agents=SimpleNamespace(ws=SimpleNamespace(worktree_dir=lambda project, rid: str(root))))
            self.assertEqual(OrchestratorManager._read_context(fake, SimpleNamespace(project="p", id="r")), "--- index.html ---\n<p>hi</p>")


if __name__ == "__main__":
    unittest.main()