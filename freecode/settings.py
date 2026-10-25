"""Versioned, allow-listed local settings storage."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .workspace import valid_id


SCHEMA_VERSION = 1
_KEYBOARD_SHORTCUT_ACTIONS = frozenset({
    "toggle_sidebar",
    "toggle_terminal",
    "toggle_right_panel",
    "search_chats",
    "open_settings",
    "open_project",
    "new_chat",
    "close_tab",
    "next_tab",
    "previous_tab",
    "reopen_tab",
})
_AUTO_ARCHIVE_INTERVALS = frozenset({"never", "1d", "7d", "30d"})
_APPEARANCE_STYLES = frozenset({"flat", "3d", "shine"})
_APPEARANCE_PRESETS = frozenset({
    "auto", "dark", "light", "og-shine", "alpine", "dune", "tide", "blossom", "orbit",
    "after-rain", "ember", "kanagawa", "aurora", "violet-hour", "phosphor", "mirage",
    "nebula", "frost", "paper", "carbon",
})
_GLOBAL_FIELDS = {
    "advanced_mode": bool,
    "notification_sounds": bool,
    "local_auto_archive": _AUTO_ARCHIVE_INTERVALS,
    "auto_next_session": bool,
    "full_access": bool,
    "pre_sync_projects": bool,
    "include_agents_md": bool,
    "appearance_style": _APPEARANCE_STYLES,
    "appearance_preset": _APPEARANCE_PRESETS,
    "keyboard_shortcuts": dict,
    "agent_mode": frozenset({"base2", "lite", "max", "plan"}),
    "sandbox": frozenset({"off", "docker"}),
    "sandbox_network": bool,
}
_PROJECT_FIELDS = {
    "startup_command": str,
    "dependency_install_policy": frozenset({"ask", "never", "project-local"}),
    "auto_fix": bool,
}
_MAX_STARTUP_COMMAND_LENGTH = 2000


class SettingsValidationError(ValueError):
    """A settings patch or project identifier is outside the supported schema."""


class SettingsStorageError(OSError):
    """A settings file could not be read or atomically saved."""


def _valid_keyboard_shortcuts(value: object) -> bool:
    if type(value) is not dict or set(value) != _KEYBOARD_SHORTCUT_ACTIONS:
        return False

    seen = set()
    for chord in value.values():
        if not isinstance(chord, str) or not 2 <= len(chord) <= 40:
            return False
        parts = chord.split("+")
        modifiers, key = parts[:-1], parts[-1]
        if (
            not modifiers
            or len(modifiers) > 3
            or any(modifier not in {"Ctrl", "Alt", "Shift"} for modifier in modifiers)
            or len(set(modifiers)) != len(modifiers)
        ):
            return False
        valid_key = (
            (len(key) == 1 and key.isalnum())
            or key in {"`", ",", "Tab"}
            or (key.startswith("F") and key[1:].isdigit() and 1 <= int(key[1:]) <= 12)
        )
        if not valid_key:
            return False
        normalized = "+".join([part.casefold() for part in modifiers] + [key.casefold()])
        if normalized in seen:
            return False
        seen.add(normalized)
    return True


def _empty_document() -> dict:
    return {"schema_version": SCHEMA_VERSION, "preferences": {}}


def _validate_patch(patch: object, fields: dict[str, object]) -> dict:
    if not isinstance(patch, dict):
        raise SettingsValidationError("settings patch must be an object")

    validated = {}
    for name, value in patch.items():
        expected_type = fields.get(name)
        if expected_type is None:
            raise SettingsValidationError("unknown settings field")
        if expected_type is bool:
            valid = type(value) is bool
        elif isinstance(expected_type, frozenset):
            valid = isinstance(value, str) and value in expected_type
        elif name == "keyboard_shortcuts":
            valid = _valid_keyboard_shortcuts(value)
        else:
            valid = isinstance(value, expected_type)
            if valid and name == "startup_command":
                valid = len(value) <= _MAX_STARTUP_COMMAND_LENGTH and "\x00" not in value
        if not valid:
            raise SettingsValidationError("settings field has an invalid value")
        validated[name] = value
    return validated


def _read_document(path: Path, fields: dict[str, object]) -> dict:
    try:
        raw_text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _empty_document()
    except (OSError, UnicodeError) as error:
        raise SettingsStorageError("settings storage is unavailable") from error

    try:
        document = json.loads(raw_text)
    except (json.JSONDecodeError, UnicodeError):
        return _empty_document()

    if (
        not isinstance(document, dict)
        or type(document.get("schema_version")) is not int
        or document["schema_version"] != SCHEMA_VERSION
        or not isinstance(document.get("preferences"), dict)
    ):
        return _empty_document()

    try:
        preferences = _validate_patch(document["preferences"], fields)
    except SettingsValidationError:
        return _empty_document()
    return {"schema_version": SCHEMA_VERSION, "preferences": preferences}


def _atomic_write(path: Path, document: dict) -> None:
    temporary_path = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(document, temporary, ensure_ascii=False, separators=(",", ":"))
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    except OSError as error:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                pass
        raise SettingsStorageError("settings storage is unavailable") from error


class SettingsStore:
    """Persist only explicitly supported global and project preferences."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)

    def _global_path(self) -> Path:
        return self.data_dir / "settings.json"

    def _project_path(self, project_id: object) -> Path:
        if not valid_id(project_id):
            raise SettingsValidationError("invalid project id")
        return self.data_dir / "settings" / "projects" / f"{project_id}.json"

    def read(self) -> dict:
        return _read_document(self._global_path(), _GLOBAL_FIELDS)

    def update(self, patch: object) -> dict:
        validated = _validate_patch(patch, _GLOBAL_FIELDS)
        document = self.read()
        document["preferences"].update(validated)
        if validated:
            _atomic_write(self._global_path(), document)
        return document

    def read_project(self, project_id: object) -> dict:
        return _read_document(self._project_path(project_id), _PROJECT_FIELDS)

    def update_project(self, project_id: object, patch: object) -> dict:
        path = self._project_path(project_id)
        validated = _validate_patch(patch, _PROJECT_FIELDS)
        document = _read_document(path, _PROJECT_FIELDS)
        document["preferences"].update(validated)
        if validated:
            _atomic_write(path, document)
        return document
