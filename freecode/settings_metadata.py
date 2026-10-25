"""Read-only metadata sources used by the local Settings pages."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


SUPPORTED_BROWSERS = ("Google Chrome", "Microsoft Edge")
_PROFILE_NAME = re.compile(r"^(?:Default|Profile \d+)$")
_SKILL_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$")
_MAX_SKILLS = 100
_MAX_SKILL_BYTES = 64 * 1024
_MAX_INSTRUCTIONS = 48 * 1024
_MAX_SEARCH = 200


def _browser_profile_roots():
    """Return only the supported browsers' conventional user-data directories."""
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        return {
            "Google Chrome": base / "Google" / "Chrome" / "User Data",
            "Microsoft Edge": base / "Microsoft" / "Edge" / "User Data",
        }
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
        return {
            "Google Chrome": base / "Google" / "Chrome",
            "Microsoft Edge": base / "Microsoft" / "Edge",
        }
    base = Path.home() / ".config"
    return {
        "Google Chrome": base / "google-chrome",
        "Microsoft Edge": base / "microsoft-edge",
    }


def read_browser_profiles(roots=None):
    """Read only allow-listed browser profile folder names; never open profile files."""
    source_roots = roots if roots is not None else _browser_profile_roots()
    browsers = []
    for browser_name in SUPPORTED_BROWSERS:
        candidate = source_roots.get(browser_name) if hasattr(source_roots, "get") else None
        profiles = []
        status = "not found"
        if candidate is not None:
            root = Path(candidate)
            try:
                if root.is_symlink() or not root.is_dir():
                    status = "unavailable" if root.exists() else "not found"
                else:
                    with os.scandir(root) as entries:
                        for entry in entries:
                            if _PROFILE_NAME.fullmatch(entry.name) and entry.is_dir(follow_symlinks=False):
                                profiles.append(entry.name)
                    profiles.sort(key=lambda name: (name != "Default", int(name[8:]) if name.startswith("Profile ") else -1))
                    status = "found" if profiles else "not found"
            except (OSError, RuntimeError, ValueError):
                status = "unavailable"
                profiles = []
        browsers.append({
            "name": browser_name,
            "profiles": profiles,
            "profile_count": len(profiles),
            "status": status,
        })
    available = any(browser["profile_count"] for browser in browsers)
    result = {"available": available, "browsers": browsers}
    if not available:
        result["reason"] = "No supported browser profile folders were found."
    return result


def _skill_fields(content, fallback_name):
    name = fallback_name
    description = "Local skill"
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return name, description
    for line in lines[1:80]:
        if line.strip() == "---":
            break
        key, separator, value = line.partition(":")
        if not separator:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key.strip() == "name" and value:
            name = value[:120]
        elif key.strip() == "description" and value:
            description = value[:300]
    return name, description


class SettingsMetadata:
    """Read local skill instructions from the app data directory only."""

    def __init__(self, data_dir):
        self.data = Path(data_dir)

    def _skills_root(self):
        root = self.data / "skills"
        try:
            if not root.is_dir() or root.is_symlink():
                return None
            data_root = self.data.resolve(strict=True)
            resolved_root = root.resolve(strict=True)
            if resolved_root != data_root / "skills":
                return None
            return resolved_root
        except (OSError, RuntimeError, ValueError):
            return None

    @staticmethod
    def _read_skill_file(path, root):
        try:
            if path.is_symlink() or not path.is_file():
                return None
            resolved = path.resolve(strict=True)
            resolved_directory = path.parent.resolve(strict=True)
            if resolved_directory.parent != root or resolved.parent != resolved_directory or resolved.name != "SKILL.md":
                return None
            if resolved.stat().st_size > _MAX_SKILL_BYTES:
                return None
            content = resolved.read_text(encoding="utf-8")
            return content[:_MAX_INSTRUCTIONS]
        except (OSError, UnicodeError, RuntimeError, ValueError):
            return None

    def list_skills(self, search=""):
        root = self._skills_root()
        if root is None:
            return {"available": False, "reason": "No local skills source is configured.", "skills": []}
        query = str(search or "")[:_MAX_SEARCH].casefold()
        skills = []
        try:
            directories = sorted(root.iterdir(), key=lambda path: path.name.casefold())
        except (OSError, RuntimeError):
            return {"available": False, "reason": "The local skills source is unavailable.", "skills": []}
        for directory in directories:
            if len(skills) >= _MAX_SKILLS:
                break
            if not _SKILL_ID.fullmatch(directory.name) or directory.is_symlink() or not directory.is_dir():
                continue
            try:
                resolved_directory = directory.resolve(strict=True)
                if resolved_directory.parent != root:
                    continue
            except (OSError, RuntimeError, ValueError):
                continue
            content = self._read_skill_file(directory / "SKILL.md", root)
            if content is None:
                continue
            name, description = _skill_fields(content, directory.name)
            if query and query not in (name + " " + description + " " + directory.name).casefold():
                continue
            skills.append({"id": directory.name, "name": name, "description": description, "source": "local"})
        return {"available": True, "skills": skills}

    def get_skill(self, skill_id):
        if not isinstance(skill_id, str) or not _SKILL_ID.fullmatch(skill_id):
            raise ValueError("invalid local skill id")
        root = self._skills_root()
        if root is None:
            raise FileNotFoundError("local skill not found")
        directory = root / skill_id
        try:
            if directory.is_symlink() or not directory.is_dir():
                raise FileNotFoundError("local skill not found")
            resolved_directory = directory.resolve(strict=True)
            if resolved_directory.parent != root:
                raise FileNotFoundError("local skill not found")
        except (OSError, RuntimeError):
            raise FileNotFoundError("local skill not found") from None
        content = self._read_skill_file(directory / "SKILL.md", root)
        if content is None:
            raise FileNotFoundError("local skill not found")
        name, description = _skill_fields(content, skill_id)
        return {"available": True, "skill": {
            "id": skill_id,
            "name": name,
            "description": description,
            "source": "local",
            "instructions": content,
        }}

    def browser_profiles(self):
        """Defer browser metadata inspection until this method is explicitly requested."""
        return read_browser_profiles()
