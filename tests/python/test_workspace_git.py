import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from freecode import workspace


class WorkspaceGitStdinTests(unittest.TestCase):
    def test_git_commands_do_not_inherit_parent_stdin(self):
        completed = subprocess.CompletedProcess(
            args=["git", "status"],
            returncode=0,
            stdout="",
            stderr="",
        )
        with patch.object(workspace.subprocess, "run", return_value=completed) as run:
            workspace.git(Path.cwd(), "status")

        self.assertIs(
            run.call_args.kwargs.get("stdin"),
            subprocess.DEVNULL,
            "noninteractive Git commands must not inherit the server's stdin pipe",
        )


if __name__ == "__main__":
    unittest.main()
