from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from freecode.agent import AgentManager
from freecode.providers import MockProvider, ProviderError, Router
from freecode.workspace import Workspace
from server_fixture import running_server

try:
    from freecode.orchestrator import (
        MAX_CHILD_INPUT_CHARS,
        MAX_CHILD_OUTPUT_CHARS,
        DiscoveryResult,
        OrchestratorManager,
        ROLE_ORDER,
    )
except ImportError:
    MAX_CHILD_INPUT_CHARS = 0
    MAX_CHILD_OUTPUT_CHARS = 0
    ROLE_ORDER = ("discover", "plan", "implement", "verify")
    OrchestratorManager = None


PROMPT = "Build a small, accessible project landing page."


def request_json(url: str, method: str = "GET", body: dict | None = None):
    raw = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(url, data=raw, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


class OrchestratorManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freecode-orchestrator-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ws = Workspace(self.root / "workspace")
        self.ws.create_project("demo", "Demo project")
        self.provider = MockProvider()
        self.router = Router(keys={}, mock=self.provider)
        self.agents = AgentManager(self.ws, self.router, store=self.root / "agents", background=False)
        self.manager = self.make_manager(self.agents, self.root / "orchestrations", background=False)

    def make_manager(self, agents, store, background=False):
        self.assertIsNotNone(OrchestratorManager, "OrchestratorManager is not implemented")
        return OrchestratorManager(agents, store=store, background=background)

    def create(self, manager=None, request_id="req-role-order", prompt=PROMPT):
        return (manager or self.manager).create("demo", prompt, "auto", request_id)

    def test_shared_provider_limit_caps_actual_typed_attempts(self):
        valid = json.dumps({"summary": "Bounded discovery.", "findings": []})
        provider = MockProvider(bad_outputs=["{}", valid])
        router = Router(keys={}, mock=provider)
        messages = [
            {"role": "system", "content": "You are Free way specialist: discover."},
            {"role": "user", "content": "{}"},
        ]

        with self.assertRaises(ProviderError):
            router.complete_typed("auto", messages, schema=DiscoveryResult, skill="plan", retries=2, max_provider_attempts=1)

        self.assertEqual(provider.calls, 1)

    def test_specialists_run_in_fixed_order_with_read_only_capabilities_except_proposals(self):
        parent = self.create()

        self.assertEqual([child["role"] for child in parent.children], list(ROLE_ORDER))
        self.assertEqual(tuple(ROLE_ORDER), ("discover", "plan", "implement", "verify"))
        self.assertTrue(all(child["status"] == "completed" for child in parent.children))
        for child in parent.children:
            capabilities = set(child["capabilities"])
            self.assertTrue(capabilities, child["role"])
            if child["role"] == "implement":
                self.assertEqual(capabilities, {"propose_actions"})
                self.assertNotIn("write_files", capabilities)
                self.assertNotIn("run_commands", capabilities)
            else:
                self.assertTrue(capabilities.isdisjoint({"write_files", "run_commands", "merge", "deploy"}))
        self.assertEqual(parent.state, "awaiting_parent_approval")
        self.assertEqual(self.agents.get(parent.parent_id).state, "needs_plan_approval")
        self.assertEqual(self.provider.calls, 4)

    def test_child_context_and_visible_output_are_bounded_and_only_one_child_is_active(self):
        long_prompt = "Build an accessible landing page. " + ("Use concise copy. " * 700)
        parent = self.create(request_id="req-bounds", prompt=long_prompt)

        self.assertLessEqual(len(long_prompt), 20_000)
        self.assertTrue(all(child["input_chars"] <= MAX_CHILD_INPUT_CHARS for child in parent.children))
        self.assertTrue(all(len(json.dumps(child["result"], ensure_ascii=False)) <= MAX_CHILD_OUTPUT_CHARS for child in parent.children))
        self.assertEqual(parent.max_active_children, 1)
        self.assertIsNone(parent.active_child)
        self.assertTrue(all("actions" not in child["result"] for child in parent.children if child["role"] != "implement"))

    def test_request_id_is_idempotent_and_checkpointed_run_does_not_repeat_specialists(self):
        first = self.create(request_id="req-idempotent")
        calls_after_first = self.provider.calls
        duplicate = self.create(request_id="req-idempotent")

        self.assertEqual(duplicate.parent_id, first.parent_id)
        self.assertEqual(self.provider.calls, calls_after_first)
        restored_agents = AgentManager(self.ws, self.router, store=self.root / "agents", background=False)
        restored = self.make_manager(restored_agents, self.root / "orchestrations", background=False)
        reloaded = restored.get(first.parent_id)
        self.assertEqual(reloaded.state, "awaiting_parent_approval")
        self.assertEqual([child["status"] for child in reloaded.children], ["completed"] * 4)
        self.assertEqual(self.provider.calls, calls_after_first)

    def test_cancel_stops_before_parent_approval_and_never_writes_a_proposal(self):
        with patch.dict(os.environ, {"FC_MOCK_PLAN_DELAY": "0.25"}):
            manager = self.make_manager(self.agents, self.root / "cancelled-orchestrations", background=True)
            parent = manager.create("demo", PROMPT, "auto", "req-cancel")
            deadline = time.monotonic() + 3
            while manager.get(parent.parent_id).active_child is None and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertIsNotNone(manager.get(parent.parent_id).active_child)
            self.assertTrue(manager.cancel(parent.parent_id))
            self.assertTrue(manager.wait(parent.parent_id, timeout=5))

        cancelled = manager.get(parent.parent_id)
        agent = self.agents.get(parent.parent_id)
        self.assertEqual(cancelled.state, "cancelled")
        self.assertEqual(agent.state, "cancelled")
        self.assertNotEqual(agent.state, "needs_plan_approval")
        self.assertEqual(self.ws.files(self.ws.worktree_dir("demo", parent.parent_id)), ["README.md"])

    def test_verification_failure_fails_closed_without_exposing_plan_approval(self):
        bad_verify = json.dumps({"status": "failed", "findings": ["The proposed actions did not pass verification."]})
        provider = MockProvider(bad_outputs=[
            json.dumps({"summary": "Inspected safe project context.", "findings": ["README is present."]}),
            json.dumps({"summary": "Plan is bounded.", "steps": ["Create one page."]}),
            json.dumps({"summary": "Prepared one page.", "steps": ["Write index.html"], "actions": [{"type": "write_file", "path": "index.html", "content": "<!doctype html><title>Demo</title>"}]}),
            bad_verify,
        ])
        router = Router(keys={}, mock=provider)
        agents = AgentManager(self.ws, router, store=self.root / "verify-failure-agents", background=False)
        manager = self.make_manager(agents, self.root / "verify-failure-orchestrations", background=False)

        parent = manager.create("demo", PROMPT, "auto", "req-verify-fail")

        self.assertEqual(parent.state, "failed")
        self.assertEqual(parent.children[-1]["role"], "verify")
        self.assertEqual(parent.children[-1]["status"], "failed")
        agent = agents.get(parent.parent_id)
        self.assertEqual(agent.state, "error")
        self.assertIsNone(agent.plan)
        self.assertEqual(agent.actions, [])
        self.assertNotEqual(agent.state, "needs_plan_approval")
        self.assertEqual(self.ws.files(self.ws.worktree_dir("demo", parent.parent_id)), ["README.md"])

    def test_parent_plan_and_each_action_still_require_approval_and_no_merge_is_triggered(self):
        parent = self.create(request_id="req-parent-approval")
        agent = self.agents.get(parent.parent_id)
        worktree = self.ws.worktree_dir("demo", parent.parent_id)

        self.assertTrue(all(action["status"] == "pending" for action in agent.actions))
        self.assertEqual(self.ws.files(worktree), ["README.md"])
        with self.assertRaises(RuntimeError):
            self.agents.merge(agent.id)

        self.agents.approve_plan(agent.id, "ask")
        self.assertEqual(agent.state, "working")
        self.assertTrue(all(action["status"] == "pending" for action in agent.actions))
        self.assertEqual(self.ws.files(worktree), ["README.md"])

        self.agents.approve_action(agent.id, 0)
        self.assertEqual(agent.actions[0]["status"], "done")
        self.assertTrue(all(action["status"] == "pending" for action in agent.actions[1:]))
        self.assertIn("index.html", self.ws.files(worktree))
        self.assertNotEqual(agent.state, "merged")
        with self.assertRaises(RuntimeError):
            self.agents.merge(agent.id)

    def test_checkpoint_resume_does_not_repeat_a_completed_approved_write(self):
        parent = self.create(request_id="req-resume-write")
        agent = self.agents.get(parent.parent_id)
        worktree = self.ws.worktree_dir("demo", parent.parent_id)
        self.agents.approve_plan(agent.id, "ask")
        self.agents.approve_action(agent.id, 0)
        original = (Path(worktree) / "index.html").read_text(encoding="utf-8")
        writes_before_restart = sum(event["kind"] == "file_written" for event in agent.log)

        restored_agents = AgentManager(self.ws, self.router, store=self.root / "agents", background=False)
        restored = restored_agents.get(parent.parent_id)
        restored_agents.approve_action(agent.id, 0)

        self.assertEqual((Path(worktree) / "index.html").read_text(encoding="utf-8"), original)
        self.assertEqual(restored.actions[0]["status"], "done")
        self.assertEqual(sum(event["kind"] == "file_written" for event in restored.log), writes_before_restart)
        self.assertTrue(all(action["status"] == "pending" for action in restored.actions[1:]))

    def test_orchestration_api_exposes_progress_and_preserves_parent_approval_state(self):
        with running_server() as (app, base_url):
            status, created = request_json(base_url + "/api/orchestrations", "POST", {
                "project": "demo",
                "prompt": PROMPT,
                "model": "auto",
                "request_id": "api-req-11",
            })
            self.assertIn(status, (200, 201, 202))
            parent_id = created["id"]
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                status, current = request_json(base_url + f"/api/agents/{parent_id}")
                if current.get("state") != "orchestrating":
                    break
                time.sleep(0.02)

            self.assertEqual(status, 200)
            self.assertEqual([child["role"] for child in current["orchestration"]["children"]], list(ROLE_ORDER))
            self.assertEqual(current["state"], "needs_plan_approval")
            self.assertTrue(all(action["status"] == "pending" for action in current["actions"]))
            auth_status, auth = request_json(base_url + "/api/auth/config")
            self.assertEqual(auth_status, 200)
            self.assertFalse(auth["enabled"])

            duplicate_status, duplicate = request_json(base_url + "/api/orchestrations", "POST", {
                "project": "demo",
                "prompt": "This changed body must not create another parent.",
                "model": "auto",
                "request_id": "api-req-11",
            })
            self.assertIn(duplicate_status, (200, 201, 202))
            self.assertEqual(duplicate["id"], parent_id)
            self.assertEqual(len(app.agents.agents), 1)


if __name__ == "__main__":
    unittest.main()
