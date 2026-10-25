"""Path and command safety for agent actions."""
import os, re, shlex
from pathlib import Path
import json

class UnsafeAction(Exception):
    pass

MAX_FILE_BYTES = 512_000

def safe_path(root, rel: str) -> Path:
    if not isinstance(rel, str) or not rel.strip():
        raise UnsafeAction("empty path")
    if "\x00" in rel:
        raise UnsafeAction("NUL in path")
    rel = rel.replace("\\", "/").strip()
    if rel.startswith("/") or re.match(r"^[A-Za-z]:", rel) or rel.startswith("~"):
        raise UnsafeAction("absolute path")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        raise UnsafeAction("path traversal")
    if parts[0] in (".git",) or ".git" in parts:
        raise UnsafeAction("git internals are protected")
    root = Path(root).resolve()
    p = (root / Path(*parts)).resolve()
    if p != root and root not in p.parents:
        raise UnsafeAction("escapes workspace")
    return p

ALLOWED = {"ls", "cat", "echo", "node", "npm", "python", "python3", "pytest", "git", "pwd",
           "head", "tail", "wc", "grep", "mkdir", "touch", "test", "true", "false", "sort", "uniq", "diff"}
BLOCKED_WORDS = ("sudo", "mkfs", "shutdown", "reboot", "curl", "wget", "ssh", "scp", "nc", "dd", "eval", "exec")
BLOCKED_TOKENS = ("rm -rf /", ":(){", "chmod 777", "> /dev", "/etc/", "~/.ssh")
BLOCKED_GIT = ("push", "remote", "config", "credential", "filter-branch", "gc", "reset --hard")


class DependencyPolicy:
    """Validate the one supported dependency install path: local npm lockfiles."""

    _PACKAGE_MANAGER_PROGRAMS = frozenset({
        "npm", "npx", "pip", "pip3", "yarn", "pnpm", "cargo", "go", "gem", "bundle",
        "composer", "gradle", "mvn", "dotnet",
    })

    @classmethod
    def is_install_request(cls, command):
        """Route package-manager entry points through the fail-closed install validator."""
        if not isinstance(command, str) or not command.strip():
            return False
        try:
            argv = shlex.split(command)
        except ValueError:
            return False
        if not argv:
            return False
        program = os.path.basename(argv[0]).lower()
        program = os.path.splitext(program)[0] if program.endswith((".exe", ".cmd", ".bat")) else program
        if program in cls._PACKAGE_MANAGER_PROGRAMS:
            return True
        return program in {"python", "python3"} and argv[1:3] == ["-m", "pip"]

    @staticmethod
    def _inside(root, candidate):
        return candidate == root or root in candidate.parents

    @staticmethod
    def _git_directory(root):
        marker = root / ".git"
        if marker.is_symlink():
            raise UnsafeAction("git metadata cannot be a symlink")
        if marker.is_dir():
            return marker.resolve(strict=True)
        if not marker.is_file():
            raise UnsafeAction("a verified Git repository is required")
        text = marker.read_text(encoding="utf-8").strip()
        if not text.startswith("gitdir:"):
            raise UnsafeAction("git worktree metadata is invalid")
        target = Path(text.split(":", 1)[1].strip())
        if not target.is_absolute():
            target = root / target
        return target.resolve(strict=True)

    @classmethod
    def _verified_worktree(cls, project, worktree):
        try:
            project_input = Path(project)
            worktree_input = Path(worktree)
            if project_input.is_symlink() or worktree_input.is_symlink():
                raise UnsafeAction("project and agent worktree cannot be symlinks")
            project_root = project_input.resolve(strict=True)
            worktree_root = worktree_input.resolve(strict=True)
            if not project_root.is_dir() or not worktree_root.is_dir():
                raise UnsafeAction("project and agent worktree must be directories")
            if project_root.parent.name != "projects" or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", project_root.name):
                raise UnsafeAction("dependency installs require a project under the workspace projects directory")
            workspace_root = project_root.parent.parent
            expected_parent = (workspace_root / "worktrees" / project_root.name).resolve(strict=True)
            if worktree_root.parent != expected_parent:
                raise UnsafeAction("dependency installs are confined to the isolated agent worktree")
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", worktree_root.name):
                raise UnsafeAction("invalid agent worktree id")

            project_git = cls._git_directory(project_root)
            if not cls._inside(project_root, project_git):
                raise UnsafeAction("project Git metadata must remain inside the project")
            worktree_git = cls._git_directory(worktree_root)
            expected_git = (project_git / "worktrees" / worktree_root.name).resolve(strict=True)
            if worktree_git != expected_git or not cls._inside(project_git, worktree_git):
                raise UnsafeAction("agent worktree is not registered to this project")
            return project_root, worktree_root
        except UnsafeAction:
            raise
        except (OSError, RuntimeError, TypeError, ValueError) as error:
            raise UnsafeAction("project worktree metadata is unavailable or invalid") from error

    @classmethod
    def validate(cls, project, worktree, command, opted_in):
        """Return a constrained npm argv only for an explicitly approved local install."""
        if opted_in is not True:
            raise UnsafeAction("dependency installation requires explicit approval")
        argv = check_command(command)
        if os.path.basename(argv[0]).lower() != "npm":
            raise UnsafeAction("only local npm lockfile installs are supported")
        if len(argv) != 3 or argv[1].lower() not in {"install", "ci"} or argv[2] != "--ignore-scripts":
            raise UnsafeAction("only npm install or npm ci with scripts disabled is allowed")

        project_root, worktree_root = cls._verified_worktree(project, worktree)

        def safe_project_file(name):
            path = worktree_root / name
            if path.is_symlink() or not path.is_file():
                raise UnsafeAction(f"{name} must be a regular file inside the agent worktree")
            resolved = path.resolve(strict=True)
            if not cls._inside(worktree_root, resolved):
                raise UnsafeAction(f"{name} escapes the agent worktree")
            return path

        try:
            manifest = json.loads(safe_project_file("package.json").read_text(encoding="utf-8"))
            lockfile = json.loads(safe_project_file("package-lock.json").read_text(encoding="utf-8"))
        except UnsafeAction:
            raise
        except (OSError, UnicodeError, ValueError, TypeError) as error:
            raise UnsafeAction("a valid package.json and package-lock.json are required") from error
        if not isinstance(manifest, dict) or not isinstance(lockfile, dict) or type(lockfile.get("lockfileVersion")) is not int or lockfile["lockfileVersion"] not in {1, 2, 3}:
            raise UnsafeAction("a valid npm package manifest and lockfile are required")

        node_modules = worktree_root / "node_modules"
        cache = worktree_root / ".freecode-npm-cache"
        for destination in (node_modules, cache):
            if destination.is_symlink():
                raise UnsafeAction("install destinations cannot be symlinks")
            if destination.exists():
                resolved = destination.resolve(strict=True)
                if not cls._inside(worktree_root, resolved):
                    raise UnsafeAction("install destinations must remain inside the agent worktree")
            if destination == node_modules and destination.exists() and not destination.is_dir():
                raise UnsafeAction("node_modules must be a directory")

        return [argv[0], argv[1].lower(), "--ignore-scripts", "--global=false",
                "--prefix", str(worktree_root), "--cache", str(cache)]


def check_command(cmd: str) -> list:
    if not isinstance(cmd, str) or not cmd.strip():
        raise UnsafeAction("empty command")
    if len(cmd) > 2000:
        raise UnsafeAction("command too long")
    low = " " + cmd.lower() + " "
    for w in re.findall(r"[a-z0-9_.-]+", low):
        if w in BLOCKED_WORDS:
            raise UnsafeAction(f"blocked token: {w}")
    for t in BLOCKED_TOKENS:
        if t in low:
            raise UnsafeAction(f"blocked token: {t.strip()}")
    if any(c in cmd for c in ("`", "$(", "|", ";", "&", ">", "<", "\n")):
        raise UnsafeAction("shell operators are not allowed")
    try:
        argv = shlex.split(cmd)
    except ValueError as e:
        raise UnsafeAction(f"bad quoting: {e}")
    if not argv:
        raise UnsafeAction("empty command")
    prog = os.path.basename(argv[0])
    if prog not in ALLOWED:
        raise UnsafeAction(f"'{prog}' is not on the allowlist")
    if prog == "git" and len(argv) > 1 and any(" ".join(argv[1:]).startswith(b) for b in BLOCKED_GIT):
        raise UnsafeAction("git subcommand blocked")
    for a in argv[1:]:
        if a.startswith("/") or ".." in a.split("/"):
            raise UnsafeAction("arguments must stay inside the workspace")
    return argv
