"""Bottom terminal API: real on a local server (safety-checked, project folder), plainly unavailable when hosted."""
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server_fixture  # noqa: F401  (offline defaults)
from server_fixture import running_server


def call(base, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class TerminalApiTests(unittest.TestCase):
    def test_local_terminal_runs_a_safe_command_in_the_project(self):
        with running_server() as (app, base):
            self.assertEqual(call(base, "/api/terminal"), (200, {"available": True, "reason": ""}))
            self.assertEqual(call(base, "/api/projects", "POST", {"id": "termdemo"})[0], 201)
            status, body = call(base, "/api/terminal", "POST", {"project": "termdemo", "command": "git --version"})
            self.assertEqual(status, 200, body)
            self.assertEqual(body["exit_code"], 0)
            self.assertIn("git version", body["output"])

    def test_local_terminal_blocks_unsafe_input(self):
        with running_server() as (app, base):
            call(base, "/api/projects", "POST", {"id": "termdemo"})
            self.assertEqual(call(base, "/api/terminal", "POST", {"project": "termdemo", "command": "git --version | more"})[0], 400)
            self.assertEqual(call(base, "/api/terminal", "POST", {"project": "../x", "command": "git --version"})[0], 400)
            self.assertEqual(call(base, "/api/terminal", "POST", {"project": "termdemo", "command": "  "})[0], 400)

    def test_hosted_terminal_is_unavailable(self):
        with patch.dict(os.environ, {"FREEWAY_HOSTED": "1"}):
            with running_server() as (app, base):
                status, body = call(base, "/api/terminal")
                self.assertEqual(status, 200)
                self.assertFalse(body["available"])
                self.assertIn("not available on hosted", body["reason"])
                self.assertEqual(call(base, "/api/terminal", "POST", {"project": "demo", "command": "git --version"})[0], 403)


if __name__ == "__main__":
    unittest.main()
