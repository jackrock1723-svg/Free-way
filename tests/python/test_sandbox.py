"""Docker sandbox: argv construction, status detection, Workspace routing and fallback.

Unit tests mock the docker CLI. The real-Docker smoke test runs only when
FW_DOCKER_SMOKE=1 and the engine answers; otherwise it is skipped.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from freecode import sandbox
from freecode.settings import SettingsStore
from freecode.workspace import Workspace


class FakeCompleted:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode, self.stdout, self.stderr = returncode, stdout, stderr


class SandboxArgvTests(unittest.TestCase):
    def test_images_and_container_argv(self):
        self.assertEqual(sandbox.image_for(["C:/x/node.exe", "-v"]), "node:22-alpine")
        self.assertEqual(sandbox.image_for(["npm", "test"]), "node:22-alpine")
        self.assertEqual(sandbox.image_for(["python", "-m", "pytest"]), "python:3.12-alpine")
        self.assertEqual(sandbox.image_for(["ls"]), sandbox.DEFAULT_IMAGE)
        self.assertEqual(sandbox.container_argv(["C:/Program Files/nodejs/npm.cmd", "test"]), ["npm", "test"])

    def test_build_is_isolated_limited_and_offline_by_default(self):
        with tempfile.TemporaryDirectory() as wt:
            box = sandbox.DockerSandbox(docker="docker")
            with patch.dict(os.environ, {"NIM_API_KEY": "test-only-not-real"}):
                argv = box.build(wt, ["npm", "test"])
            joined = " ".join(argv)
            self.assertEqual(argv[:3], ["docker", "run", "--rm"])
            self.assertIn("--network none", joined)
            for flag in ("--cpus 1.0", "--memory 1g", "--pids-limit 256", "--cap-drop ALL", "--security-opt no-new-privileges"):
                self.assertIn(flag, joined)
            self.assertIn(f"{Path(wt).resolve()}:/work", argv)
            self.assertNotIn("NIM_API_KEY", joined)
            self.assertNotIn("test-only-not-real", joined)
            env_values = [argv[i + 1] for i, item in enumerate(argv) if item == "-e"]
            self.assertEqual(sorted(v.split("=")[0] for v in env_values), ["CI", "HOME", "LANG", "NODE_ENV"])
            self.assertEqual(argv[-3:], ["node:22-alpine", "npm", "test"])
            self.assertIn("--network bridge", " ".join(box.build(wt, ["npm", "test"], network=True)))


class SandboxStatusTests(unittest.TestCase):
    def test_status_available(self):
        box = sandbox.DockerSandbox(docker="docker")
        with patch.object(sandbox.subprocess, "run", return_value=FakeCompleted(0, "29.0.0\n")):
            state = box.status(refresh=True)
        self.assertTrue(state["available"])
        self.assertEqual(state["version"], "29.0.0")

    def test_status_engine_not_running(self):
        box = sandbox.DockerSandbox(docker="docker")
        with patch.object(sandbox.subprocess, "run", return_value=FakeCompleted(1, "", "cannot connect")):
            state = box.status(refresh=True)
        self.assertFalse(state["available"])
        self.assertIn("Start Docker Desktop", state["reason"])

    def test_status_timeout_and_missing_cli(self):
        box = sandbox.DockerSandbox(docker="docker")
        with patch.object(sandbox.subprocess, "run", side_effect=subprocess.TimeoutExpired("docker", 8)):
            self.assertFalse(box.status(refresh=True)["available"])
        with patch.object(sandbox.shutil, "which", return_value=None):
            state = sandbox.DockerSandbox().status(refresh=True)
        self.assertIn("not installed", state["reason"])

    def test_run_timeout_removes_container(self):
        box = sandbox.DockerSandbox(docker="docker")
        calls = []

        def fake(argv, **kwargs):
            calls.append(argv)
            if argv[1] == "run":
                raise subprocess.TimeoutExpired(argv, 1)
            return FakeCompleted(0)

        with tempfile.TemporaryDirectory() as wt, patch.object(sandbox.subprocess, "run", side_effect=fake):
            result = box.run(wt, ["npm", "test"], "npm test", timeout=1)
        self.assertEqual(result["exit_code"], 124)
        self.assertEqual(calls[-1][:3], ["docker", "rm", "-f"])
        self.assertTrue(result["sandbox"]["used"])


class WorkspaceSandboxRoutingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freeway-sbx-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.settings = SettingsStore(root / "data")
        self.ws = Workspace(root / "ws", settings_store=self.settings)
        self.wt = root / "wt"
        self.wt.mkdir()

    def test_sandbox_off_runs_on_host_without_note(self):
        result = self.ws.run(self.wt, "echo hi")
        self.assertNotIn("sandbox", result)

    def test_docker_mode_delegates_when_engine_available(self):
        self.settings.update({"sandbox": "docker", "sandbox_network": False})
        with patch.object(sandbox.SANDBOX, "status", return_value={"available": True}), \
             patch.object(sandbox.SANDBOX, "run", return_value={"command": "echo hi", "exit_code": 0, "output": "hi", "sandbox": {"used": True}}) as run:
            result = self.ws.run(self.wt, "echo hi")
        self.assertTrue(result["sandbox"]["used"])
        self.assertFalse(run.call_args.kwargs["network"])

    def test_docker_mode_falls_back_with_clear_message(self):
        self.settings.update({"sandbox": "docker"})
        with patch.object(sandbox.SANDBOX, "status", return_value={"available": False, "reason": "Docker engine is not running. Start Docker Desktop to use the sandbox."}), \
             patch.object(sandbox.SANDBOX, "run") as run:
            result = self.ws.run(self.wt, "echo hi")
        run.assert_not_called()
        self.assertFalse(result["sandbox"]["used"])
        self.assertTrue(result["output"].startswith("[Sandbox unavailable: Docker engine is not running."))

    def test_settings_allowlist(self):
        self.assertEqual(self.settings.update({"sandbox": "docker"})["preferences"]["sandbox"], "docker")
        with self.assertRaises(ValueError):
            self.settings.update({"sandbox": "vm"})
        with self.assertRaises(ValueError):
            self.settings.update({"sandbox_network": "yes"})


@unittest.skipUnless(os.environ.get("FW_DOCKER_SMOKE") == "1", "set FW_DOCKER_SMOKE=1 to run the real Docker smoke test")
class RealDockerSmokeTest(unittest.TestCase):
    def test_python_runs_in_container_without_network(self):
        box = sandbox.DockerSandbox()
        if not box.status(refresh=True).get("available"):
            self.skipTest("Docker engine is not available")
        with tempfile.TemporaryDirectory() as wt:
            Path(wt, "probe.py").write_text("import os, socket\nprint('in-container', os.getcwd())\ntry:\n    socket.create_connection(('1.1.1.1', 53), 3)\n    print('network on')\nexcept OSError:\n    print('network off')\n", encoding="utf-8")
            result = box.run(wt, ["python", "probe.py"], "python probe.py", timeout=60)
        self.assertEqual(result["exit_code"], 0, result["output"])
        self.assertIn("in-container /work", result["output"])
        self.assertIn("network off", result["output"])


if __name__ == "__main__":
    unittest.main()
