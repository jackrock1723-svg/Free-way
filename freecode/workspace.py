"""Projects as git repos; one git worktree + branch per agent."""
import os, re, subprocess, json
import threading
import shutil
from dataclasses import dataclass
from pathlib import Path
from .safety import safe_path, check_command, UnsafeAction, MAX_FILE_BYTES, DependencyPolicy

GIT_ENV = {"GIT_AUTHOR_NAME": "Free way", "GIT_AUTHOR_EMAIL": "agent@freecode.local",
           "GIT_COMMITTER_NAME": "Free way", "GIT_COMMITTER_EMAIL": "agent@freecode.local",
           "GIT_TERMINAL_PROMPT": "0"}

def git(cwd, *args, check=True):
    env = dict(os.environ, **GIT_ENV)
    r = subprocess.run(["git", *args], cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=30)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")

def valid_id(x):
    return isinstance(x, str) and bool(ID_RE.match(x))

class Workspace:
    def __init__(self, root, settings_store=None):
        self.root = Path(root).resolve()
        self.settings_store = settings_store
        self._diff_lock = threading.Lock()
        (self.root / "projects").mkdir(parents=True, exist_ok=True)
        (self.root / "worktrees").mkdir(parents=True, exist_ok=True)

    def project_dir(self, pid):
        if not valid_id(pid): raise UnsafeAction("bad project id")
        return self.root / "projects" / pid

    def create_project(self, pid, name=None):
        d = self.project_dir(pid)
        if d.exists(): return d
        d.mkdir(parents=True)
        git(d, "init", "-q", "-b", "main")
        (d / "README.md").write_text(f"# {name or pid}\n\nCreated with Free way.\n", encoding="utf-8")
        git(d, "add", "-A"); git(d, "commit", "-q", "-m", "Initial commit")
        return d

    def list_projects(self):
        return sorted(p.name for p in (self.root / "projects").iterdir() if (p / ".git").exists())

    def worktree_dir(self, pid, aid):
        if not valid_id(aid): raise UnsafeAction("bad agent id")
        return self.root / "worktrees" / pid / aid

    def add_worktree(self, pid, aid):
        d = self.worktree_dir(pid, aid)
        if d.exists(): return d
        d.parent.mkdir(parents=True, exist_ok=True)
        git(self.project_dir(pid), "worktree", "add", "-q", "-b", f"fc/{aid}", str(d), "main")
        return d

    def write_file(self, wt, rel, content):
        if not isinstance(content, str): raise UnsafeAction("content must be text")
        if len(content.encode()) > MAX_FILE_BYTES: raise UnsafeAction("file too large")
        p = safe_path(wt, rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        existed = p.exists()
        p.write_text(content, encoding="utf-8")
        return {"path": rel, "created": not existed, "bytes": len(content.encode())}

    def read_file(self, wt, rel):
        p = safe_path(wt, rel)
        if not p.is_file(): raise FileNotFoundError(rel)
        return p.read_text(errors="replace", encoding="utf-8")

    def files(self, wt):
        wt = Path(wt); out = []
        for p in sorted(wt.rglob("*")):
            if p.is_file() and ".git" not in p.relative_to(wt).parts:
                out.append(str(p.relative_to(wt)))
        return out

    def run(self, wt, command, timeout=20, approved_action=False):
        """Run an approved command. Falls back to the desktop app's own runtimes when node or python is not installed."""
        if DependencyPolicy.is_install_request(command):
            try:
                worktree_root = Path(wt).resolve(strict=True)
                worktrees_root = (self.root / "worktrees").resolve(strict=True)
                relative = worktree_root.relative_to(worktrees_root)
                if len(relative.parts) != 2:
                    raise UnsafeAction("dependency installs require an isolated agent worktree")
                project_id, agent_id = relative.parts
                if not valid_id(project_id) or not valid_id(agent_id):
                    raise UnsafeAction("invalid project or agent worktree id")
                project = self.project_dir(project_id).resolve(strict=True)
                if self.worktree_dir(project_id, agent_id).resolve(strict=True) != worktree_root:
                    raise UnsafeAction("dependency installs require the exact agent worktree")
            except UnsafeAction:
                raise
            except (OSError, RuntimeError, ValueError) as error:
                raise UnsafeAction("dependency installs require an existing isolated agent worktree") from error

            preferences = self.settings_store.read_project(project_id)["preferences"] if self.settings_store else {}
            policy = preferences.get("dependency_install_policy", "ask")
            opted_in = policy == "project-local" or (policy == "ask" and approved_action is True)
            argv = DependencyPolicy.validate(project, worktree_root, command, opted_in=opted_in)
        else:
            argv = check_command(command)

        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(wt), "LANG": "C.UTF-8",
               "NODE_ENV": "test", "CI": "1", **GIT_ENV}
        if os.name == "nt":                     # Windows child processes need these to start at all
            env.update({k: os.environ[k] for k in ("SYSTEMROOT", "SystemRoot", "WINDIR", "PATHEXT", "TEMP", "TMP", "COMSPEC") if k in os.environ}); env["USERPROFILE"] = str(wt)
        if DependencyPolicy.is_install_request(command):
            cache = str(Path(wt).resolve() / ".freecode-npm-cache")
            env.update({"NPM_CONFIG_GLOBAL": "false", "NPM_CONFIG_PREFIX": str(Path(wt).resolve()),
                        "NPM_CONFIG_CACHE": cache, "NPM_CONFIG_IGNORE_SCRIPTS": "true"})
        argv = list(argv)
        prefs = {}
        if self.settings_store:
            try: prefs = self.settings_store.read().get("preferences") or {}
            except Exception: prefs = {}
        fallback = None
        if prefs.get("sandbox") == "docker":
            from . import sandbox
            state = sandbox.SANDBOX.status()
            if state.get("available"):
                return sandbox.SANDBOX.run(wt, argv, command, timeout=timeout, network=bool(prefs.get("sandbox_network")))
            fallback = sandbox.fallback_note(state.get("reason") or "Docker is unavailable.")
        result = self._run_host(wt, command, argv, env, timeout)
        if fallback:
            result["sandbox"] = fallback
            result["output"] = "[" + fallback["message"] + "]\n" + result["output"]
        return result

    def _run_host(self, wt, command, argv, env, timeout):
        env.update(runtime_for(argv))
        try:
            r = subprocess.run(argv, cwd=wt, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=timeout)
            out = (r.stdout + r.stderr)[-64_000:]
            return {"command": command, "exit_code": r.returncode, "output": out}
        except subprocess.TimeoutExpired:
            return {"command": command, "exit_code": 124, "output": f"timed out after {timeout}s"}
        except FileNotFoundError:
            return {"command": command, "exit_code": 127, "output": f"{argv[0]}: not installed"}

    def commit(self, wt, message):
        git(wt, "add", "-A")
        if not git(wt, "status", "--porcelain").strip(): return None
        git(wt, "commit", "-q", "-m", message[:200])
        return git(wt, "rev-parse", "--short", "HEAD").strip()

    def diff(self, wt):
        with self._diff_lock:
            git(wt, "add", "-A", "-N")
            d = git(wt, "diff", "main", "--stat=200") + "\n" + git(wt, "diff", "main")
            return d

    def diff_files(self, wt):
        with self._diff_lock:
            git(wt, "add", "-A", "-N")
            out = []
            for line in git(wt, "diff", "main", "--numstat").splitlines():
                parts = line.split("\t")
                if len(parts) == 3:
                    a, r, f = parts
                    out.append({"path": f, "added": int(a) if a.isdigit() else 0, "removed": int(r) if r.isdigit() else 0})
            return out

    def merge(self, pid, aid):
        d = self.project_dir(pid)
        git(d, "merge", "--no-ff", "-q", "-m", f"Merge agent {aid}", f"fc/{aid}")
        return git(d, "rev-parse", "--short", "HEAD").strip()


@dataclass(frozen=True)
class RuntimeStatus:
    language: str
    marker: str
    toolchain: str
    available: bool


class RuntimeRegistry:
    """Report project markers and installed tools without downloading or executing them."""

    KNOWN = (
        ("Node.js", ("package.json",), ("node",)),
        ("Python", ("pyproject.toml", "requirements.txt", "setup.py", "Pipfile"), ("python", "python3")),
    )

    @classmethod
    def detect(cls, root):
        try:
            project_root = Path(root).resolve(strict=True)
        except (OSError, RuntimeError, TypeError, ValueError):
            return []
        if not project_root.is_dir():
            return []

        statuses = []
        for language, markers, executables in cls.KNOWN:
            marker = next((name for name in markers
                           if (project_root / name).is_file() and not (project_root / name).is_symlink()), None)
            if marker is None:
                continue
            installed = next((name for name in executables if shutil.which(name)), None)
            statuses.append(RuntimeStatus(language, marker, installed or executables[0], installed is not None))
        return statuses


def runtime_for(argv):
    """The desktop app ships Python and can run Electron as Node, so checks work on machines with neither installed.
    Mutates argv[0] when it substitutes; returns extra environment variables."""
    import shutil, sys
    exe = argv[0].lower()
    if exe in ("node", "node.exe") and not shutil.which("node") and os.environ.get("FREECODE_NODE"):
        argv[0] = os.environ["FREECODE_NODE"]; return {"ELECTRON_RUN_AS_NODE": "1"}
    if exe in ("python", "python3", "python.exe") and not shutil.which(argv[0]) and sys.executable:
        argv[0] = sys.executable
    return {}
