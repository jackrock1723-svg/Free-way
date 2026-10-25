"""Buffy multi-agent modes: local agents, model agents through the offline mock, handoffs."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from freecode import buffy
from freecode.agent import AgentManager
from freecode.orchestrator import ROLE_ORDER, OrchestratorManager, ParentRun
from freecode.providers import MockProvider, Router
from freecode.settings import SettingsStore
from freecode.workspace import Workspace

PROMPT = "Build a small landing page with a signup form and a pricing section."


def make_repo(root: Path) -> Path:
    (root / "src").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / "tests").mkdir()
    (root / "src" / "signup.js").write_text("export function signupForm() { return 'form'; }\nclass PricingTable {}\n", encoding="utf-8")
    (root / "src" / "util.py").write_text("def helper():\n    return 1\n\nclass Thing:\n    pass\n", encoding="utf-8")
    (root / "README.md").write_text("# Demo\n\nThe signup form posts to the API.\n\nUnrelated paragraph.\n", encoding="utf-8")
    (root / "docs" / "pricing.md").write_text("Pricing section shows three plans.\n", encoding="utf-8")
    (root / ".env").write_text("SIGNUP_KEY=do-not-read\n", encoding="utf-8")
    (root / "api_token.py").write_text("signup = 'do-not-read'\n", encoding="utf-8")
    (root / "package.json").write_text(json.dumps({"scripts": {"test": "node --test"}}), encoding="utf-8")
    (root / "tests" / "test_util.py").write_text("import unittest\n", encoding="utf-8")
    return root


class LocalAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freeway-buffy-")
        self.addCleanup(self.temp.cleanup)
        self.root = make_repo(Path(self.temp.name))
        self.cmap = buffy.code_map(self.root)

    def test_code_map_lists_symbols_and_skips_secret_files(self):
        self.assertIn("signupForm", self.cmap["src/signup.js"])
        self.assertIn("PricingTable", self.cmap["src/signup.js"])
        self.assertEqual(self.cmap["src/util.py"], ["helper", "Thing"])
        self.assertNotIn(".env", self.cmap)
        self.assertNotIn("api_token.py", self.cmap)

    def test_file_picker_ranks_relevant_files(self):
        result = buffy.file_picker(PROMPT, self.cmap)
        self.assertIn("src/signup.js", result["files"])
        self.assertLessEqual(len(result["files"]), buffy.MAX_PICKS)

    def test_code_searcher_returns_bounded_hits_without_secrets(self):
        result = buffy.code_searcher(self.root, PROMPT, self.cmap)
        self.assertTrue(any(hit.startswith("src/signup.js:1:") for hit in result["hits"]))
        self.assertFalse(any("do-not-read" in hit for hit in result["hits"]))
        self.assertLessEqual(len(result["hits"]), buffy.MAX_HITS)

    def test_researcher_reads_local_docs_only(self):
        result = buffy.researcher(self.root, PROMPT)
        joined = "\n".join(result["notes"])
        self.assertIn("signup form", joined)
        self.assertIn("docs/pricing.md", joined)
        self.assertNotIn("Unrelated paragraph", joined)

    def test_basher_only_proposes_validated_test_commands(self):
        result = buffy.basher(self.root, None)
        self.assertEqual(result["commands"], ["npm test", "python -m unittest discover -s tests"])
        self.assertIn("nothing was executed", result["summary"])

    def test_selector_prefers_picked_files_then_smaller_change(self):
        def proposal(path, content):
            return {"summary": "s", "steps": ["x"], "actions": [{"type": "write_file", "path": path, "content": content}]}
        candidates = {
            "editor_minimal": proposal("other.js", "a"),
            "editor_robust": proposal("src/signup.js", "a" * 50),
            "editor_tests": proposal("src/signup.js", "a" * 500),
        }
        name, chosen = buffy.select_best(candidates, ["src/signup.js"])
        self.assertEqual(name, "editor_robust")
        self.assertEqual(chosen["actions"][0]["path"], "src/signup.js")

    def test_handoff_markdown_lists_agents(self):
        text = buffy.handoff_markdown({"parent_id": "a1", "mode": "base2", "state": "planned", "prompt": PROMPT,
                                       "children": [{"role": "file_picker", "status": "completed", "result": {"summary": "Picked", "files": ["src/signup.js"]}, "error": None}]})
        self.assertIn("## file_picker (completed)", text)
        self.assertIn("- src/signup.js", text)

    def test_modes_and_capabilities_are_complete(self):
        self.assertEqual(buffy.DEFAULT_MODE, "base2")
        self.assertEqual(set(buffy.MODES), {"base2", "lite", "max", "plan"})
        for roles in buffy.MODES.values():
            for role in roles:
                self.assertIn(role, buffy.CAPABILITIES)
        self.assertNotIn("editor", buffy.MODES["plan"])
        self.assertEqual([r for r in buffy.MODES["max"] if r.startswith("editor")], ["editor_minimal", "editor_robust", "editor_tests"])
        for agent in ("file_picker", "code_searcher", "researcher", "thinker", "editor", "reviewer", "basher"):
            self.assertIn(agent, buffy.MODES["base2"])


class BuffyOrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freeway-buffy-run-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ws = Workspace(self.root / "workspace")
        self.ws.create_project("demo", "Demo project")
        self.router = Router(keys={}, mock=MockProvider())
        self.agents = AgentManager(self.ws, self.router, store=self.root / "agents", background=False)
        self.store = self.root / "orchestrations"
        self.manager = OrchestratorManager(self.agents, store=self.store, background=False)

    def run_mode(self, mode, rid=None):
        run = self.manager.create("demo", PROMPT, "auto", rid or f"rid-{mode}", mode=mode)
        return run, self.agents.get(run.parent_id)

    def test_each_build_mode_reaches_parent_plan_approval(self):
        for mode in ("base2", "lite", "max"):
            with self.subTest(mode=mode):
                run, parent = self.run_mode(mode)
                self.assertEqual(run.state, "awaiting_parent_approval")
                self.assertEqual(parent.state, "needs_plan_approval")
                self.assertEqual([c["role"] for c in run.children], list(buffy.MODES[mode]))
                self.assertTrue(all(c["status"] == "completed" for c in run.children))
                self.assertLessEqual(run.provider_calls, buffy.CALL_LIMITS[mode])
                self.assertTrue(parent.actions)
                self.assertTrue(all(a["status"] == "pending" for a in parent.actions))
                self.assertTrue(any(a["type"] == "write_file" for a in parent.actions))
                self.assertEqual(self.manager.snapshot(run.parent_id)["mode"], mode)

    def test_plan_mode_never_proposes_file_writes(self):
        run, parent = self.run_mode("plan")
        self.assertEqual(run.state, "planned")
        self.assertEqual(parent.state, "planned")
        self.assertEqual(parent.actions, [])
        self.assertTrue(parent.plan["steps"])
        self.assertEqual(run.provider_calls, 2)

    def test_max_mode_selector_picks_one_of_three_editors(self):
        run, _ = self.run_mode("max")
        selector = next(c for c in run.children if c["role"] == "selector")
        self.assertIn("from 3 valid proposal(s)", selector["result"]["summary"])

    def test_max_mode_tolerates_one_failing_editor_strategy(self):
        original = self.router.complete_typed

        def flaky(model, messages, **kwargs):
            if "Strategy: robust" in messages[0]["content"]:
                raise ValueError("editor failed")
            return original(model, messages, **kwargs)

        with patch.object(self.router, "complete_typed", side_effect=flaky):
            run, parent = self.run_mode("max", "rid-max-flaky")
        robust = next(c for c in run.children if c["role"] == "editor_robust")
        self.assertEqual(robust["status"], "failed")
        self.assertEqual(parent.state, "needs_plan_approval")

    def test_reviewer_failure_blocks_parent_approval(self):
        original = self.router.complete_typed

        def failing_review(model, messages, **kwargs):
            if messages[0]["content"].startswith("You are Free way agent: reviewer"):
                return buffy.ReviewerResult(status="failed", findings=["Missing error handling."]), None
            return original(model, messages, **kwargs)

        with patch.object(self.router, "complete_typed", side_effect=failing_review):
            run, parent = self.run_mode("base2", "rid-review-fail")
        self.assertEqual(run.state, "failed")
        self.assertEqual(parent.state, "error")
        self.assertEqual(parent.actions, [])

    def test_handoffs_are_written_as_json_and_markdown(self):
        run, _ = self.run_mode("lite")
        data = json.loads((self.store / f"{run.parent_id}.handoff.json").read_text(encoding="utf-8"))
        self.assertEqual(data["mode"], "lite")
        self.assertNotIn("proposal", data)
        md = (self.store / f"{run.parent_id}.handoff.md").read_text(encoding="utf-8")
        self.assertIn("## editor (completed)", md)
        self.assertIn("## basher (completed)", md)

    def test_unknown_mode_is_rejected_and_classic_stays_default(self):
        with self.assertRaises(ValueError):
            self.manager.create("demo", PROMPT, "auto", "rid-bad", mode="turbo")
        run = self.manager.create("demo", PROMPT, "auto", "rid-classic")
        self.assertEqual(run.mode, "classic")
        self.assertEqual([c["role"] for c in run.children], list(ROLE_ORDER))

    def test_buffy_run_restores_with_its_mode(self):
        run, _ = self.run_mode("lite", "rid-restore")
        saved = json.loads((self.store / f"{run.parent_id}.json").read_text(encoding="utf-8"))
        restored = ParentRun.restore(saved)
        self.assertEqual(restored.mode, "lite")
        saved["mode"] = "turbo"
        with self.assertRaises(ValueError):
            ParentRun.restore(saved)


class AgentModeSettingTests(unittest.TestCase):
    def test_agent_mode_preference_is_allowlisted(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SettingsStore(directory)
            self.assertEqual(store.update({"agent_mode": "max"})["preferences"]["agent_mode"], "max")
            with self.assertRaises(ValueError):
                store.update({"agent_mode": "turbo"})


if __name__ == "__main__":
    unittest.main()
