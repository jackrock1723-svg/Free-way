"""Buffy: Codebuff-style multi-agent pipeline for Free way (free providers only).

Modes (selected per run or in Settings > General > Agent mode):
  base2  default: file picker, code searcher, researcher, thinker, editor, reviewer, basher
  lite   faster: file picker, code searcher, editor, reviewer, basher
  max    best-of-N: three editors with different strategies, a selector picks the best
  plan   plan only: no editor, no file writes, no commands

Local agents never use the network or a model: code map, file picker, code searcher,
researcher (local docs only) and basher (proposes test commands; never executes them).
Model agents (thinker, editors, reviewer, planner) go through the existing free-provider
router with strict schemas. Every proposed action still waits for parent plan approval
and per-action approval in the existing agent flow. Handoffs are written as JSON and
Markdown next to the run checkpoint.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, ValidationError, model_validator

from .safety import safe_path
from .schema import Action, RunCommand, Strict

MODES = {
    "base2": ("file_picker", "code_searcher", "researcher", "thinker", "editor", "reviewer", "basher"),
    "lite": ("file_picker", "code_searcher", "editor", "reviewer", "basher"),
    "max": ("file_picker", "code_searcher", "researcher", "thinker",
            "editor_minimal", "editor_robust", "editor_tests", "selector", "reviewer", "basher"),
    "plan": ("file_picker", "code_searcher", "researcher", "thinker", "planner"),
}
DEFAULT_MODE = "base2"
CALL_LIMITS = {"base2": 3, "lite": 2, "max": 5, "plan": 2}
EDITOR_STRATEGIES = {
    "editor": "balanced: make the smallest complete change that solves the task",
    "editor_minimal": "minimal: change as few files and lines as possible",
    "editor_robust": "robust: handle edge cases and errors carefully",
    "editor_tests": "test-first: include or update a focused test with the change",
}
MODEL_AGENTS = {"thinker", "planner", "reviewer", *EDITOR_STRATEGIES}
CAPABILITIES = {
    "file_picker": ("read_code_map",),
    "code_searcher": ("read_project_files",),
    "researcher": ("read_local_docs",),
    "thinker": ("read_context", "draft_analysis"),
    "planner": ("read_context", "draft_plan"),
    "selector": ("compare_proposals",),
    "reviewer": ("read_proposed_actions",),
    "basher": ("propose_commands",),
    **{name: ("propose_actions",) for name in EDITOR_STRATEGIES},
}

MAX_ACTIONS = 8
MAX_PROPOSAL_BYTES = 48_000
MAX_MAP_FILES = 400
MAX_SCAN_BYTES = 64_000
MAX_PICKS = 6
MAX_HITS = 20
MAX_DOC_CHARS = 1_500
EXCLUDED_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".venv", "venv", "data", "secrets", "__pycache__"}
CODE_SUFFIXES = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".md", ".json", ".toml", ".yaml", ".yml"}
SECRET_TOKENS = (".env", "secret", "token", "credential", "private", "password", "apikey", "api-key", "lock")
SYMBOL_PATTERNS = {
    ".py": re.compile(r"^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)", re.M),
    ".js": re.compile(r"(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()"),
}
SYMBOL_PATTERNS.update({s: SYMBOL_PATTERNS[".js"] for s in (".jsx", ".ts", ".tsx")})
STOP = {"the", "and", "for", "with", "that", "this", "from", "into", "make", "build", "add", "please", "page", "small", "new"}

Text = Annotated[str, Field(min_length=1, max_length=1_000)]
Step = Annotated[str, Field(min_length=1, max_length=300)]


class ThinkerResult(Strict):
    summary: Text
    approach: list[Step] = Field(min_length=1, max_length=8)
    risks: list[Text] = Field(max_length=8)


class PlannerResult(Strict):
    summary: Text
    steps: list[Step] = Field(min_length=1, max_length=12)


class EditorResult(Strict):
    summary: Text
    steps: list[Step] = Field(min_length=1, max_length=8)
    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)

    @model_validator(mode="after")
    def _bounded(self):
        if not any(a.type == "write_file" for a in self.actions):
            raise ValueError("the editor proposal must include a file change")
        if sum(len(a.content.encode("utf-8")) for a in self.actions if a.type == "write_file") > MAX_PROPOSAL_BYTES:
            raise ValueError("the editor proposal exceeds its size limit")
        return self


class ReviewerResult(Strict):
    status: Literal["passed", "failed"]
    findings: list[Text] = Field(max_length=8)


SCHEMAS = {"thinker": ThinkerResult, "planner": PlannerResult, "reviewer": ReviewerResult,
           **{name: EditorResult for name in EDITOR_STRATEGIES}}
PROMPTS = {
    "thinker": "You are Free way agent: thinker. Analyse the task with the picked files, search hits and docs. Return one JSON object with summary, approach and risks. Never write files or run commands.",
    "planner": "You are Free way agent: planner. Plan mode: return one JSON object with summary and ordered steps only. Never propose file writes or commands.",
    "reviewer": "You are Free way agent: reviewer. Review the proposal metadata for bugs, unsafe paths and missing steps. Return status passed only when it is complete and safe, otherwise failed with findings.",
    **{name: f"You are Free way agent: editor. Strategy: {desc}. Return one JSON object with summary, steps and at most eight safe action proposals. Proposals only: never execute them."
       for name, desc in EDITOR_STRATEGIES.items()},
}


def valid_mode(mode) -> bool:
    return isinstance(mode, str) and mode in MODES


def child(role: str) -> dict:
    return {"role": role, "capabilities": list(CAPABILITIES[role]), "status": "pending",
            "input_chars": 0, "output_chars": 0, "result": None, "error": None}


def _tokens(text: str) -> list[str]:
    seen = []
    for word in re.findall(r"[A-Za-z][A-Za-z0-9_]{2,}", text.lower()):
        if word not in STOP and word not in seen:
            seen.append(word)
    return seen[:12]


def _files(root: Path):
    count = 0
    for directory, subdirs, files in os.walk(root, followlinks=False):
        subdirs[:] = sorted(d for d in subdirs if d.lower() not in EXCLUDED_DIRS and not (Path(directory) / d).is_symlink())
        for name in sorted(files):
            path = Path(directory) / name
            rel = path.relative_to(root).as_posix()
            if path.is_symlink() or path.suffix.lower() not in CODE_SUFFIXES or any(t in rel.lower() for t in SECRET_TOKENS):
                continue
            count += 1
            if count > MAX_MAP_FILES:
                return
            yield rel


def _read(root: Path, rel: str) -> str:
    try:
        with safe_path(root, rel).open("rb") as handle:
            return handle.read(MAX_SCAN_BYTES).decode("utf-8", errors="replace")
    except (OSError, ValueError):
        return ""


def code_map(root) -> dict:
    """Regex symbol map of the repo (tree-sitter is optional and not bundled)."""
    root = Path(root)
    result = {}
    for rel in _files(root):
        pattern = SYMBOL_PATTERNS.get(Path(rel).suffix.lower())
        symbols = []
        if pattern:
            for match in pattern.finditer(_read(root, rel)):
                name = next((g for g in match.groups() if g), None)
                if name and name not in symbols:
                    symbols.append(name)
                if len(symbols) >= 20:
                    break
        result[rel] = symbols
    return result


def file_picker(task: str, cmap: dict, index=None) -> dict:
    indexed = []
    if index is not None:
        try:
            indexed = [p for p in index.pick_files(" ".join(_tokens(task)), MAX_PICKS) if p in cmap]
        except Exception:
            indexed = []
    words = _tokens(task)
    scored = []
    for rel, symbols in cmap.items():
        hay_path = rel.lower()
        hay_syms = " ".join(symbols).lower()
        score = sum(3 for w in words if w in hay_path) + sum(1 for w in words if w in hay_syms)
        if score:
            scored.append((-score, rel))
    picks = indexed + [rel for _, rel in sorted(scored) if rel not in indexed]
    picks = picks[:MAX_PICKS]
    if not picks:
        picks = [rel for rel in cmap if Path(rel).name.lower() in ("index.html", "readme.md", "main.py", "app.js", "package.json")][:MAX_PICKS]
    source = " using the code index" if indexed else ""
    return {"summary": f"Picked {len(picks)} relevant file(s) from a map of {len(cmap)}{source}.", "files": picks}


def code_searcher(root, task: str, cmap: dict, index=None) -> dict:
    root = Path(root)
    words = _tokens(task)[:5]
    hits = []
    if index is not None and words:
        try:
            hits = [f"{h['path']}:{h['line']}: {h['text']}" for h in index.search(" ".join(words), MAX_HITS) if h["path"] in cmap]
        except Exception:
            hits = []
        if hits:
            return {"summary": f"Found {len(hits)} indexed match(es) for {', '.join(words)}.", "hits": hits[:MAX_HITS]}
    for rel in cmap:
        if len(hits) >= MAX_HITS or not words:
            break
        for number, line in enumerate(_read(root, rel).splitlines(), 1):
            low = line.lower()
            if any(w in low for w in words):
                hits.append(f"{rel}:{number}: {line.strip()[:160]}")
                if len(hits) >= MAX_HITS:
                    break
    return {"summary": f"Found {len(hits)} matching line(s) for {', '.join(words) or 'no keywords'}.", "hits": hits}


def researcher(root, task: str) -> dict:
    """Local docs lookup only (README, AGENTS.md, docs/*.md); no network in this build."""
    root = Path(root)
    words = _tokens(task)
    candidates = [p for p in ("README.md", "AGENTS.md") if (root / p).is_file()]
    if (root / "docs").is_dir():
        candidates += [f"docs/{p.name}" for p in sorted((root / "docs").glob("*.md"))[:10]]
    notes, total = [], 0
    for rel in candidates:
        if any(t in rel.lower() for t in SECRET_TOKENS):
            continue
        for para in re.split(r"\n\s*\n", _read(root, rel)):
            if para.strip() and (not words or any(w in para.lower() for w in words)):
                text = f"{rel}: {para.strip()[:400]}"
                if total + len(text) > MAX_DOC_CHARS:
                    break
                notes.append(text)
                total += len(text)
    return {"summary": f"Read {len(candidates)} local doc(s); {len(notes)} relevant note(s).", "notes": notes}


def basher(root, proposal: dict | None) -> dict:
    """Propose (never run) the project's test command so it goes through action approval."""
    root = Path(root)
    commands = []
    pkg = root / "package.json"
    if pkg.is_file():
        try:
            if "test" in (json.loads(_read(root, "package.json") or "{}").get("scripts") or {}):
                commands.append("npm test")
        except (ValueError, AttributeError):
            pass
    if (root / "tests").is_dir() and any((root / "tests").glob("test_*.py")):
        commands.append("python -m unittest discover -s tests")
    valid = []
    for command in commands:
        try:
            RunCommand(type="run_command", command=command)
            valid.append(command)
        except ValidationError:
            continue
    return {"summary": f"Proposed {len(valid)} test command(s); nothing was executed.", "commands": valid}


def select_best(candidates: dict, picks: list[str]) -> tuple[str, dict]:
    """Deterministic best-of-N: prefer valid proposals touching picked files, then smaller diffs."""
    order = list(EDITOR_STRATEGIES)
    def score(item):
        name, proposal = item
        paths = [a.get("path") for a in proposal["actions"] if a.get("type") == "write_file"]
        overlap = sum(1 for p in paths if p in picks)
        size = sum(len(a.get("content", "")) for a in proposal["actions"])
        tests = 1 if any("test" in (p or "").lower() for p in paths) else 0
        return (-overlap, -tests, size, order.index(name))
    name, proposal = sorted(candidates.items(), key=score)[0]
    return name, proposal


def public(role: str, value) -> dict:
    if role == "thinker":
        return {"summary": value.summary, "findings": list(value.approach) + [f"Risk: {r}" for r in value.risks]}
    if role == "planner":
        return {"summary": value.summary, "findings": list(value.steps)}
    if role == "reviewer":
        return {"summary": "Review passed." if value.status == "passed" else "Review found problems.", "status": value.status, "findings": list(value.findings)}
    actions = [{"type": a.type, **({"path": a.path, "bytes": len(a.content.encode("utf-8"))} if a.type == "write_file" else {"command": a.command})} for a in value.actions]
    return {"summary": value.summary, "findings": list(value.steps), "proposed_actions": actions}


def handoff_markdown(run_dict: dict) -> str:
    lines = [f"# Free way handoff {run_dict.get('parent_id')}", "", f"- Mode: {run_dict.get('mode')}",
             f"- State: {run_dict.get('state')}", f"- Task: {str(run_dict.get('prompt', ''))[:500]}", ""]
    for c in run_dict.get("children", []):
        result = c.get("result") or {}
        lines.append(f"## {c['role']} ({c['status']})")
        if result.get("summary"):
            lines.append(result["summary"])
        for key in ("files", "hits", "notes", "findings", "commands"):
            for item in (result.get(key) or [])[:20]:
                lines.append(f"- {item}")
        if c.get("error"):
            lines.append(f"Error: {c['error']}")
        lines.append("")
    return "\n".join(lines)
