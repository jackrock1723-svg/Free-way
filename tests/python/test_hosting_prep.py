"""Hosting prep (Render): port from $PORT and safe forwarded proto."""
from __future__ import annotations
import unittest
from pathlib import Path
import server_fixture  # noqa: F401
from freecode import server, sandbox
from unittest.mock import patch


class PortFromEnvTests(unittest.TestCase):
    def test_port_env_is_used_when_valid(self):
        self.assertEqual(server.default_port({"PORT": "10000"}), 10000)
        self.assertEqual(server.default_port({"PORT": " 8080 "}), 8080)

    def test_missing_or_bad_port_falls_back(self):
        for env in ({}, {"PORT": ""}, {"PORT": "abc"}, {"PORT": "0"}, {"PORT": "70000"}, {"PORT": "-5"}):
            self.assertEqual(server.default_port(env), 8790, env)


class ForwardedProtoTests(unittest.TestCase):
    def test_render_sends_https(self):
        self.assertEqual(server.public_origin(None, "free-way.onrender.com", "https", "cloud"), "https://free-way.onrender.com")

    def test_comma_lists_use_the_first_hop(self):
        self.assertEqual(server.public_origin("a.example, b.internal", "b.internal", "https, http", "cloud"), "https://a.example")

    def test_bad_or_missing_proto_falls_back_safely(self):
        self.assertEqual(server.public_origin(None, "free-way.onrender.com", "javascript", "cloud"), "https://free-way.onrender.com")
        self.assertEqual(server.public_origin(None, "free-way.onrender.com", None, "cloud"), "https://free-way.onrender.com")
        self.assertEqual(server.public_origin(None, "127.0.0.1:8899", None, "cloud"), "http://127.0.0.1:8899")
        self.assertEqual(server.public_origin(None, "localhost:8790", None, "local"), "http://localhost:8790")
        self.assertEqual(server.public_origin(None, None, None, "local"), "http://127.0.0.1")

    def test_explicit_http_is_kept(self):
        self.assertEqual(server.public_origin(None, "example.test", "HTTP", "cloud"), "http://example.test")


class HostedSandboxTests(unittest.TestCase):
    def test_hosted_without_docker_reports_cleanly(self):
        with patch.dict("os.environ", {"RENDER": "true"}), patch("shutil.which", return_value=None):
            st = sandbox.DockerSandbox().status(refresh=True)
        self.assertEqual(st, {"available": False, "hosted": True, "reason": "The Docker sandbox is unavailable on hosted Free way."})

    def test_local_without_docker_keeps_old_message(self):
        with patch.dict("os.environ", {"RENDER": "", "FREEWAY_HOSTED": ""}), patch("shutil.which", return_value=None):
            st = sandbox.DockerSandbox().status(refresh=True)
        self.assertEqual(st["reason"], "Docker is not installed on this computer.")
        self.assertFalse(st["hosted"])

    def test_hosted_flag_values(self):
        self.assertTrue(sandbox.is_hosted({"FREEWAY_HOSTED": "1"}))
        self.assertTrue(sandbox.is_hosted({"RENDER": "true"}))
        self.assertFalse(sandbox.is_hosted({}))

class DockerfileDepsTests(unittest.TestCase):
    def test_dockerfile_installs_runtime_deps(self):
        text = (Path(__file__).resolve().parents[2] / "Dockerfile").read_text(encoding="utf-8")
        for dep in ("pydantic", "google-auth", "psycopg[binary]"):
            self.assertIn(dep, text)


if __name__ == "__main__":
    unittest.main()