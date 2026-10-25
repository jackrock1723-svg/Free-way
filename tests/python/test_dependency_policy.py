"""Offline tests for dependency-install policy, toolchain detection, and repair gates."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json

from freecode.agent import Agent, AgentManager
from freecode.providers import MockProvider, Router
from freecode.settings import SettingsStore
from freecode.schema import Plan
from freecode.workspace import Workspace
from freecode.safety import UnsafeAction

try:
    from freecode.safety import DependencyPolicy
except ImportError:
    DependencyPolicy = None

try:
    from freecode.workspace import RuntimeRegistry
except ImportError:
    RuntimeRegistry = None

try:
    from server_fixture import running_server
except ImportError:
    from tests.python.server_fixture import running_server


def request_json(base_url: str, path: str, method: str = "GET", body: dict | None = None):
    raw = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(
        base_url + path,
        data=raw,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urlopen(request, timeout=3) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8", errors="replace"))


class DependencyPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freecode-dependency-policy-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ws = Workspace(self.root / "ws")
        self.project = self.ws.create_project("demo", "Demo project")
        self.worktree = self.ws.add_worktree("demo", "agent-1")
        self.settings = SettingsStore(self.root / "data")
        self.ws.settings_store = self.settings

    def install_manifest(self):
        Path(self.worktree, "package.json").write_text('{"name":"fixture","version":"1.0.0"}', encoding="utf-8")
        Path(self.worktree, "package-lock.json").write_text(
            '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}',
            encoding="utf-8",
        )

    def require_policy(self):
        self.assertIsNotNone(DependencyPolicy, "DependencyPolicy is not implemented")
        return DependencyPolicy

    def update_project(self, patch):
        try:
            return self.settings.update_project("demo", patch)
        except (TypeError, ValueError, OSError) as error:
            self.fail(f"project dependency settings are not supported yet: {error}")

    def test_install_requires_explicit_opt_in_and_safe_local_npm_lockfiles(self):
        self.install_manifest()
        policy = self.require_policy()

        with self.assertRaises(UnsafeAction):
            policy.validate(self.project, self.worktree, "npm ci --ignore-scripts", opted_in=False)

        argv = policy.validate(self.project, self.worktree, "npm ci --ignore-scripts", opted_in=True)
        self.assertEqual(argv[0], "npm")
        self.assertEqual(argv[1], "ci")
        self.assertIn("--ignore-scripts", argv)
        self.assertIn("--global=false", argv)
        self.assertIn("--prefix", argv)
        self.assertEqual(Path(argv[argv.index("--prefix") + 1]), Path(self.worktree))
        self.assertIn("--cache", argv)
        self.assertTrue(Path(argv[argv.index("--cache") + 1]).is_relative_to(Path(self.worktree)))

    def test_install_requires_manifest_and_lockfile_inside_the_agent_worktree(self):
        policy = self.require_policy()
        with self.assertRaises(UnsafeAction):
            policy.validate(self.project, self.worktree, "npm ci --ignore-scripts", opted_in=True)

        Path(self.worktree, "package.json").write_text('{"name":"fixture"}', encoding="utf-8")
        with self.assertRaises(UnsafeAction):
            policy.validate(self.project, self.worktree, "npm install --ignore-scripts", opted_in=True)

        Path(self.worktree, "package-lock.json").write_text('{"lockfileVersion":3,"packages":{}}', encoding="utf-8")
        argv = policy.validate(self.project, self.worktree, "npm install --ignore-scripts", opted_in=True)
        self.assertEqual(argv[1], "install")

    def test_global_remote_shell_traversal_and_arbitrary_installer_commands_are_rejected(self):
        self.install_manifest()
        policy = self.require_policy()
        unsafe = (
            "npm install -g --ignore-scripts",
            "npm install --global --ignore-scripts",
            "npx create-vite --yes",
            "npm exec --yes remote-tool",
            "npm ci --ignore-scripts && echo escaped",
            "npm install ../outside --ignore-scripts",
            "npm install --prefix ../../outside --ignore-scripts",
            "npm run postinstall",
            "python -m pip install -r requirements.txt",
            "pip install -r requirements.txt",
            "yarn install --immutable",
            "pnpm install --ignore-scripts",
            "cargo install example",
        )
        for command in unsafe:
            with self.subTest(command=command):
                with self.assertRaises(UnsafeAction):
                    policy.validate(self.project, self.worktree, command, opted_in=True)

    def test_install_rejects_symlinked_lockfile_that_escapes_the_worktree(self):
        self.install_manifest()
        outside = self.root / "outside-lock.json"
        outside.write_text('{"lockfileVersion":3,"packages":{}}', encoding="utf-8")
        lockfile = Path(self.worktree, "package-lock.json")
        lockfile.unlink()
        try:
            lockfile.symlink_to(outside)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symbolic links are unavailable in this Windows environment: {error}")

        with self.assertRaises(UnsafeAction):
            self.require_policy().validate(self.project, self.worktree, "npm ci --ignore-scripts", opted_in=True)

    def test_project_dependency_policy_and_auto_fix_fields_are_allowlisted(self):
        saved = self.update_project({"dependency_install_policy": "project-local", "auto_fix": True})
        self.assertEqual(saved["preferences"]["dependency_install_policy"], "project-local")
        self.assertIs(saved["preferences"]["auto_fix"], True)
        self.assertEqual(self.settings.read_project("demo"), saved)

        for patch in (
            {"dependency_install_policy": "global"},
            {"dependency_install_policy": True},
            {"auto_fix": "yes"},
        ):
            with self.subTest(patch=patch):
                with self.assertRaises(ValueError):
                    self.settings.update_project("demo", patch)

    def test_workspace_applies_project_install_policy_before_process_launch(self):
        self.install_manifest()
        self.update_project({"dependency_install_policy": "never"})
        with patch("freecode.workspace.subprocess.run") as run:
            with self.assertRaises(UnsafeAction):
                self.ws.run(self.worktree, "npm ci --ignore-scripts")
        run.assert_not_called()

    def test_workspace_rejects_other_package_manager_commands_before_process_launch(self):
        self.install_manifest()
        self.update_project({"dependency_install_policy": "project-local"})
        unsafe = (
            "npm publish",
            "npm pack",
            "npm rebuild",
            "npm audit fix",
            "npm link",
            "python -m pip uninstall --yes fixture",
        )
        with patch("freecode.workspace.runtime_for", return_value={}), \
             patch("freecode.workspace.subprocess.run") as run:
            for command in unsafe:
                with self.subTest(command=command):
                    with self.assertRaises(UnsafeAction):
                        self.ws.run(self.worktree, command, approved_action=True)
        run.assert_not_called()

    def test_install_failure_and_interruption_are_not_reported_as_success(self):
        self.install_manifest()
        self.update_project({"dependency_install_policy": "project-local"})
        failed = subprocess.CompletedProcess(
            args=["npm", "ci"], returncode=1, stdout="", stderr="simulated registry failure"
        )
        with patch("freecode.workspace.runtime_for", return_value={}), \
             patch("freecode.workspace.subprocess.run", return_value=failed) as run:
            result = self.ws.run(self.worktree, "npm ci --ignore-scripts")
        self.assertEqual(result["exit_code"], 1)
        self.assertIn("simulated registry failure", result["output"])
        self.assertIn("--ignore-scripts", run.call_args.args[0])
        self.assertIn("--global=false", run.call_args.args[0])
        self.assertEqual(Path(run.call_args.kwargs["cwd"]).resolve(), Path(self.worktree).resolve())

        with patch("freecode.workspace.runtime_for", return_value={}), \
             patch("freecode.workspace.subprocess.run", side_effect=subprocess.TimeoutExpired("npm", 1)):
            interrupted = self.ws.run(self.worktree, "npm ci --ignore-scripts", timeout=1)
        self.assertEqual(interrupted["exit_code"], 124)
        self.assertIn("timed out", interrupted["output"])

    def test_install_process_is_never_started_before_the_agent_action_is_approved(self):
        self.install_manifest()
        self.update_project({"dependency_install_policy": "ask"})
        provider = MockProvider()
        manager = AgentManager(self.ws, Router(keys={}, mock=provider), background=False)
        agent = Agent("agent-1", "demo", "Install locked project dependencies", "auto")
        agent.state = "working"
        agent.actions = [{
            "type": "run_command",
            "command": "npm ci --ignore-scripts",
            "status": "pending",
            "risk": "command",
            "attempts": 0,
        }]
        manager.agents[agent.id] = agent
        success = subprocess.CompletedProcess(args=["npm", "ci"], returncode=0, stdout="installed", stderr="")

        with patch("freecode.workspace.runtime_for", return_value={}), \
             patch.object(self.ws, "commit", return_value="fake-commit"), \
             patch("freecode.workspace.subprocess.run", return_value=success) as run:
            self.assertEqual(agent.actions[0]["status"], "pending")
            run.assert_not_called()
            manager.approve_action(agent.id, 0)

        run.assert_called_once()
        self.assertEqual(agent.actions[0]["status"], "done")
        self.assertIn("--ignore-scripts", run.call_args.args[0])


class RuntimeRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freecode-runtimes-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "project"
        self.root.mkdir()

    def detect(self):
        self.assertIsNotNone(RuntimeRegistry, "RuntimeRegistry is not implemented")
        return RuntimeRegistry.detect(self.root)

    def test_registry_reports_known_project_markers_with_available_or_missing_toolchains(self):
        (self.root / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
        (self.root / "pyproject.toml").write_text("[project]\nname='demo'\n", encoding="utf-8")
        found = {"node": "C:/tools/node.exe"}

        with patch("shutil.which", side_effect=lambda name: found.get(name)) as which:
            statuses = self.detect()

        by_language = {item.language: item for item in statuses}
        self.assertEqual(set(by_language), {"Node.js", "Python"})
        self.assertTrue(by_language["Node.js"].available)
        self.assertFalse(by_language["Python"].available)
        self.assertEqual(by_language["Node.js"].marker, "package.json")
        self.assertEqual(by_language["Node.js"].toolchain, "node")
        self.assertEqual(which.call_count, 3)

    def test_registry_reads_only_known_markers_and_never_downloads_or_executes_tools(self):
        (self.root / "unknown.build").write_text("not a recognized marker", encoding="utf-8")
        (self.root / "README.md").write_text("hello", encoding="utf-8")
        with patch("shutil.which", return_value=None), patch("freecode.workspace.subprocess.run") as run:
            statuses = self.detect()
        self.assertEqual(statuses, [])
        run.assert_not_called()


class DependencyPolicyApiTests(unittest.TestCase):
    def test_project_settings_roundtrip_and_runtime_status_endpoint_are_truthful(self):
        with running_server() as (_, base_url):
            status, settings = request_json(base_url, "/api/settings/projects/demo")
            self.assertEqual(status, 200)
            self.assertEqual(settings["preferences"].get("dependency_install_policy", "ask"), "ask")
            self.assertFalse(settings["preferences"].get("auto_fix", False))

            patch = {"dependency_install_policy": "project-local", "auto_fix": True}
            status, saved = request_json(base_url, "/api/settings/projects/demo", "PUT", patch)
            self.assertEqual(status, 200)
            self.assertEqual(saved["preferences"], patch)
            self.assertEqual(request_json(base_url, "/api/settings/projects/demo"), (200, saved))

            status, error = request_json(
                base_url,
                "/api/settings/projects/demo",
                "PUT",
                {"dependency_install_policy": "global"},
            )
            self.assertEqual(status, 400)
            self.assertIn("error", error)

            status, runtime_status = request_json(base_url, "/api/projects/demo/runtimes")
            self.assertEqual(status, 200)
            self.assertEqual(runtime_status, {"runtimes": []})


class AutomaticRepairTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freecode-auto-repair-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ws = Workspace(self.root / "ws")
        self.ws.create_project("demo", "Demo project")
        self.settings = SettingsStore(self.root / "data")
        self.ws.settings_store = self.settings
        self.provider = MockProvider()
        self.router = Router(keys={}, mock=self.provider)
        self.manager = AgentManager(self.ws, self.router, background=False)

    def make_failed_agent(self):
        agent = Agent("agent-1", "demo", "Run the project check", "auto")
        agent.state = "working"
        agent.actions = [{
            "type": "run_command",
            "command": "pytest",
            "status": "done",
            "risk": "command",
            "attempts": 1,
            "result": {"command": "pytest", "exit_code": 1, "output": "AssertionError: deterministic failure"},
        }]
        self.manager.agents[agent.id] = agent
        self.ws.add_worktree("demo", agent.id)
        return agent

    def test_automatic_repair_is_off_by_default_and_failed_checks_go_to_review(self):
        agent = self.make_failed_agent()
        with patch.object(self.manager, "_fix") as fix:
            self.manager._maybe_finish(agent)

        fix.assert_not_called()
        self.assertEqual(agent.fix_round, 0)
        self.assertEqual(agent.checks, "failed")
        self.assertEqual(agent.state, "review")

    def test_preview_error_does_not_start_repair_by_default(self):
        agent = self.make_failed_agent()
        agent.state = "review"
        with patch.object(self.manager, "_fix") as fix:
            self.manager.preview_error(agent.id, "TypeError: preview failed")
        fix.assert_not_called()
        self.assertEqual(agent.state, "review")
        self.assertTrue(any(event["kind"] == "preview_error_review_required" for event in agent.log))

    def test_preview_error_can_be_repaired_after_repair_is_enabled(self):
        agent = self.make_failed_agent()
        agent.state = "review"
        with patch.object(self.manager, "_fix") as fix:
            self.manager.preview_error(agent.id, "TypeError: preview failed")
        fix.assert_not_called()

        self.settings.update_project("demo", {"auto_fix": True})
        with patch.object(self.manager, "_fix") as fix:
            self.manager.preview_error(agent.id, "TypeError: preview failed")
        fix.assert_called_once()
        self.assertEqual(agent.state, "fixing")

    def test_preview_error_starts_bounded_repair_only_after_explicit_opt_in(self):
        self.settings.update_project("demo", {"auto_fix": True})
        agent = self.make_failed_agent()
        agent.state = "review"
        with patch.object(self.manager, "_fix") as fix:
            self.manager.preview_error(agent.id, "TypeError: preview failed")
        fix.assert_called_once()
        self.assertEqual(agent.state, "fixing")

    def test_enabled_repair_stops_after_repeated_identical_failures_and_preserves_review_gate(self):
        try:
            self.settings.update_project("demo", {"auto_fix": True})
        except ValueError as error:
            self.fail(f"automatic-repair preference is not supported yet: {error}")
        agent = self.make_failed_agent()
        fix_plan = {
            "summary": "Retry the failed check after a bounded repair proposal.",
            "steps": ["Review the failure and retry the approved check."],
            "actions": [{"type": "run_command", "command": "pytest"}],
        }

        with patch.object(self.router, "complete_typed", return_value=(Plan.model_validate(fix_plan), {"provider": "mock"})) as complete, \
             patch.object(self.ws, "run", return_value={"command": "pytest", "exit_code": 1, "output": "AssertionError: deterministic failure"}):
            self.manager._maybe_finish(agent)
            while agent.state == "working":
                pending = next((index for index, action in enumerate(agent.actions) if action["status"] == "pending"), None)
                if pending is None:
                    break
                self.manager.approve_action(agent.id, pending)

        self.assertEqual(agent.state, "review")
        self.assertEqual(agent.checks, "failed")
        self.assertEqual(agent.fix_round, self.manager.FIX_ROUNDS)
        self.assertTrue(any(event["kind"] == "fix_stopped" for event in agent.log))
        self.assertEqual(complete.call_count, 2)
        self.assertNotEqual(agent.state, "merged")


if __name__ == "__main__":
    unittest.main()
