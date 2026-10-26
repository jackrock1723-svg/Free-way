"""Optional Docker sandbox for approved agent commands (Basher / checks).

When the `sandbox` setting is "docker" and the Docker engine answers, an approved command
runs in a throwaway container: only the agent worktree is mounted at /work, no host
environment variables or secrets are passed, the network is off unless the owner enables
`sandbox_network`, and CPU, memory, process count and run time are limited. If Docker is
not available the command runs on this PC with the existing safeguards and the result
carries a clear `sandbox` note explaining why.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

MODES = ("off", "docker")
IMAGES = {
    "node": "node:22-alpine", "npm": "node:22-alpine", "npx": "node:22-alpine",
    "python": "python:3.12-alpine", "python3": "python:3.12-alpine", "pip": "python:3.12-alpine",
    "pytest": "python:3.12-alpine",
}
DEFAULT_IMAGE = "python:3.12-alpine"
LIMITS = {"cpus": "1.0", "memory": "1g", "pids": "256"}
STATUS_TTL = 30.0
STATUS_TIMEOUT = 8
START_OVERHEAD = 90  # first run may pull the image


def image_for(argv: list[str]) -> str:
    name = Path(argv[0]).name.lower() if argv else ""
    for suffix in (".exe", ".cmd", ".bat"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return IMAGES.get(name, DEFAULT_IMAGE)


def container_argv(argv: list[str]) -> list[str]:
    """Strip Windows paths/suffixes so the container resolves its own runtime."""
    if not argv:
        return argv
    name = Path(argv[0]).name
    for suffix in (".exe", ".cmd", ".bat"):
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
    return [name, *argv[1:]]


HOSTED_REASON = "The Docker sandbox is unavailable on hosted Free way."


def is_hosted(env=None) -> bool:
    """True on a hosting platform (Render sets RENDER=true) or when FREEWAY_HOSTED=1 is set."""
    e = os.environ if env is None else env
    return str(e.get("RENDER", "")).lower() == "true" or str(e.get("FREEWAY_HOSTED", "")).lower() in ("1", "true", "yes")


class DockerSandbox:
    def __init__(self, docker: str | None = None):
        self._docker = docker
        self._lock = threading.Lock()
        self._cached: tuple[float, dict] | None = None

    def cli(self) -> str | None:
        return self._docker or shutil.which("docker")

    def status(self, refresh: bool = False) -> dict:
        with self._lock:
            if not refresh and self._cached and time.monotonic() - self._cached[0] < STATUS_TTL:
                return dict(self._cached[1])
        cli = self.cli()
        if not cli:
            reason = HOSTED_REASON if is_hosted() else "Docker is not installed on this computer."
            result = {"available": False, "hosted": is_hosted(), "reason": reason}
        else:
            try:
                r = subprocess.run([cli, "version", "--format", "{{.Server.Version}}"], capture_output=True, text=True,
                                   encoding="utf-8", errors="replace", timeout=STATUS_TIMEOUT, stdin=subprocess.DEVNULL)
                version = (r.stdout or "").strip()
                if r.returncode == 0 and version:
                    result = {"available": True, "version": version[:40], "reason": None}
                else:
                    result = {"available": False, "reason": "Docker engine is not running. Start Docker Desktop to use the sandbox."}
            except (OSError, subprocess.TimeoutExpired):
                result = {"available": False, "reason": "Docker engine did not answer in time. Start Docker Desktop to use the sandbox."}
        with self._lock:
            self._cached = (time.monotonic(), result)
        return dict(result)

    def build(self, wt, argv: list[str], *, network: bool = False, name: str | None = None) -> list[str]:
        mount = str(Path(wt).resolve())
        return [
            self.cli() or "docker", "run", "--rm", "--name", name or f"fw-sbx-{uuid.uuid4().hex[:10]}",
            "--pull", "missing",
            "--network", "bridge" if network else "none",
            "--cpus", LIMITS["cpus"], "--memory", LIMITS["memory"], "--pids-limit", LIMITS["pids"],
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--tmpfs", "/tmp:rw,size=256m",
            "-e", "CI=1", "-e", "NODE_ENV=test", "-e", "HOME=/tmp", "-e", "LANG=C.UTF-8",
            "-v", f"{mount}:/work", "-w", "/work",
            image_for(argv), *container_argv(argv),
        ]

    def run(self, wt, argv: list[str], command: str, *, timeout: int = 20, network: bool = False) -> dict:
        name = f"fw-sbx-{uuid.uuid4().hex[:10]}"
        full = self.build(wt, argv, network=network, name=name)
        env = {k: v for k, v in os.environ.items() if k.upper() in ("PATH", "SYSTEMROOT", "WINDIR", "USERPROFILE", "HOME", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "DOCKER_HOST", "DOCKER_CONTEXT")}
        note = {"mode": "docker", "used": True, "image": image_for(argv), "network": "on" if network else "off"}
        try:
            r = subprocess.run(full, capture_output=True, text=True, encoding="utf-8", errors="replace",
                               env=env, timeout=timeout + START_OVERHEAD, stdin=subprocess.DEVNULL)
            return {"command": command, "exit_code": r.returncode, "output": ((r.stdout or "") + (r.stderr or ""))[-64_000:], "sandbox": note}
        except subprocess.TimeoutExpired:
            try:
                subprocess.run([self.cli() or "docker", "rm", "-f", name], capture_output=True, timeout=20, stdin=subprocess.DEVNULL)
            except (OSError, subprocess.TimeoutExpired):
                pass
            return {"command": command, "exit_code": 124, "output": f"timed out after {timeout}s in the Docker sandbox", "sandbox": note}
        except OSError:
            return {"command": command, "exit_code": 127, "output": "docker: could not start", "sandbox": note}


SANDBOX = DockerSandbox()


def fallback_note(reason: str) -> dict:
    return {"mode": "docker", "used": False, "reason": reason,
            "message": f"Sandbox unavailable: {reason} The command ran on this computer with the usual approval safeguards."}
