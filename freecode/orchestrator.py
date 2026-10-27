"""Bounded sequential specialist workflow that can only propose parent-approved actions."""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, model_validator

from . import buffy, catalog
from .agent import ChitChat, is_chitchat
from .schema import Action, Strict
from .safety import safe_path
from .workspace import valid_id

ROLE_ORDER = ("discover", "plan", "implement", "verify")
ROLE_CAPABILITIES = {
    "discover": ("read_project_context",),
    "plan": ("read_project_context", "draft_plan"),
    "implement": ("propose_actions",),
    "verify": ("read_proposed_actions",),
}
MAX_CHILDREN = 4
MAX_PROVIDER_CALLS = 4
MAX_CHILD_INPUT_CHARS = 12_000
MAX_CHILD_OUTPUT_CHARS = 64_000
MAX_CHILD_RESULT_CHARS = 4_000
MAX_CONTEXT_CHARS = 6_000
MAX_CONTEXT_FILES = 6
MAX_CONTEXT_FILE_CHARS = 1_200
MAX_PROMPT_CHARS = 4_000
MAX_ACTIONS = 8
MAX_PROPOSAL_BYTES = 48_000
MAX_RUN_FILE_BYTES = 512_000

ChildText = Annotated[str, Field(min_length=1, max_length=1_000)]


class DiscoveryResult(Strict):
    summary: ChildText
    findings: list[ChildText] = Field(max_length=8)


class PlanningResult(Strict):
    summary: ChildText
    steps: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(min_length=1, max_length=8)


class ImplementationResult(Strict):
    summary: ChildText
    steps: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(min_length=1, max_length=8)
    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)

    @model_validator(mode="after")
    def _bounded_proposal(self):
        if not any(action.type == "write_file" for action in self.actions):
            raise ValueError("the implementation proposal must include a file change")
        total = 0
        for action in self.actions:
            if action.type == "write_file":
                size = len(action.content.encode("utf-8"))
                if size > MAX_PROPOSAL_BYTES:
                    raise ValueError("a proposed file exceeds the specialist output limit")
                total += size
        if total > MAX_PROPOSAL_BYTES:
            raise ValueError("the complete proposal exceeds the specialist output limit")
        return self


class VerificationResult(Strict):
    status: Literal["passed", "failed"]
    findings: list[ChildText] = Field(max_length=8)


SCHEMAS = {
    "discover": DiscoveryResult,
    "plan": PlanningResult,
    "implement": ImplementationResult,
    "verify": VerificationResult,
}
SYSTEM_PROMPTS = {
    "discover": "You are Free way specialist: discover. Read only the bounded project context. Return one JSON object with summary and findings. Do not propose or perform file writes, commands, merge, or deployment.",
    "plan": "You are Free way specialist: plan. Read only the bounded task, project context, and discovery notes. Return one JSON object with summary and ordered steps. Do not propose or perform file writes, commands, merge, or deployment.",
    "implement": "You are Free way specialist: implement. Read the bounded task, context, and plan. Return one JSON object with summary, steps, and at most eight safe action proposals. These are proposals only: never execute them, write files, run commands, merge, or deploy.",
    "verify": "You are Free way specialist: verify. Read only the bounded proposal summary and safe action metadata. Return status passed only when the proposal is structurally complete and safe; otherwise return failed with findings. Never propose or perform file writes, commands, merge, or deployment.",
}


def _child(role: str) -> dict:
    return {
        "role": role,
        "capabilities": list(ROLE_CAPABILITIES[role]),
        "status": "pending",
        "input_chars": 0,
        "output_chars": 0,
        "result": None,
        "error": None,
    }


@dataclass
class ParentRun:
    parent_id: str
    project: str
    prompt: str
    model: str
    request_id: str
    state: str = "queued"
    created: float = field(default_factory=time.time)
    children: list[dict] = field(default_factory=lambda: [_child(role) for role in ROLE_ORDER])
    active_child: str | None = None
    max_active_children: int = 0
    provider_calls: int = 0
    cancel_requested: bool = False
    error: str | None = None
    proposal: dict | None = field(default=None, repr=False)
    mode: str = "classic"

    def to_dict(self, include_private: bool = False) -> dict:
        result = {
            "parent_id": self.parent_id,
            "project": self.project,
            "prompt": self.prompt,
            "model": self.model,
            "request_id": self.request_id,
            "state": self.state,
            "created": self.created,
            "children": json.loads(json.dumps(self.children)),
            "active_child": self.active_child,
            "max_active_children": self.max_active_children,
            "provider_calls": self.provider_calls,
            "cancel_requested": self.cancel_requested,
            "error": self.error,
            "mode": self.mode,
        }
        if include_private:
            result["proposal"] = json.loads(json.dumps(self.proposal)) if self.proposal is not None else None
        return result

    def public_dict(self) -> dict:
        return {
            "id": self.parent_id,
            "state": self.state,
            "children": [
                {
                    "role": child["role"],
                    "capabilities": list(child["capabilities"]),
                    "status": child["status"],
                    "input_chars": child["input_chars"],
                    "output_chars": child["output_chars"],
                    "result": json.loads(json.dumps(child["result"])) if child["result"] is not None else None,
                    "error": child["error"],
                }
                for child in self.children
            ],
            "active_child": self.active_child,
            "max_active_children": self.max_active_children,
            "provider_calls": self.provider_calls,
            "provider_call_limit": buffy.CALL_LIMITS.get(self.mode, MAX_PROVIDER_CALLS),
            "mode": self.mode,
            "error": self.error,
        }

    @classmethod
    def restore(cls, data: dict) -> "ParentRun":
        parent_id = data.get("parent_id")
        if not valid_id(parent_id):
            raise ValueError("bad parent id")
        mode = data.get("mode", "classic")
        if mode != "classic" and not buffy.valid_mode(mode):
            raise ValueError("bad agent mode")
        roles = list(ROLE_ORDER) if mode == "classic" else list(buffy.MODES[mode])
        default_children = [_child(role) for role in ROLE_ORDER] if mode == "classic" else [buffy.child(role) for role in roles]
        run = cls(
            parent_id=parent_id,
            project=data["project"],
            prompt=data["prompt"],
            model=data["model"],
            request_id=data["request_id"],
            state=data.get("state", "queued"),
            created=float(data.get("created", time.time())),
            children=data.get("children") or default_children,
            active_child=data.get("active_child"),
            max_active_children=int(data.get("max_active_children", 0)),
            provider_calls=int(data.get("provider_calls", 0)),
            cancel_requested=bool(data.get("cancel_requested", False)),
            error=data.get("error"),
            proposal=data.get("proposal"),
            mode=mode,
        )
        if [child.get("role") for child in run.children] != roles:
            raise ValueError("bad specialist role order")
        return run


class OrchestratorManager:
    """Run one bounded specialist child at a time; parent actions stay pending for approval."""

    def __init__(self, agent_manager, store=None, background=True):
        self.agents = agent_manager
        self.router = agent_manager.router
        self.store = Path(store) if store else None
        self.background = background
        self.runs: dict[str, ParentRun] = {}
        self.request_ids: dict[str, str] = {}
        self.lock = threading.RLock()
        self.threads: dict[str, threading.Thread] = {}
        if self.store:
            self.store.mkdir(parents=True, exist_ok=True)
            self._load()

    def _path(self, parent_id: str) -> Path:
        if not valid_id(parent_id):
            raise ValueError("bad parent id")
        return self.store / f"{parent_id}.json"

    def _save(self, run: ParentRun) -> None:
        if self.store is None:
            return
        payload = json.dumps(run.to_dict(include_private=True), ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode("utf-8")) > MAX_RUN_FILE_BYTES:
            raise ValueError("specialist checkpoint exceeds its storage limit")
        path = self._path(run.parent_id)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(payload, encoding="utf-8")
        os.replace(temporary, path)

    def _load(self) -> None:
        for path in sorted(self.store.glob("a*.json")):
            try:
                if path.stat().st_size > MAX_RUN_FILE_BYTES:
                    continue
                run = ParentRun.restore(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                continue
            self.runs[run.parent_id] = run
            self.request_ids[run.request_id] = run.parent_id
        for run in list(self.runs.values()):
            if run.state not in ("queued", "running"):
                continue
            try:
                parent = self.agents.get(run.parent_id)
            except KeyError:
                self._fail(run, None, "Specialist workflow could not resume; no parent record was found.")
                continue
            if run.cancel_requested or parent.state == "cancelled":
                run.state = "cancelled"
                run.active_child = None
                run.cancel_requested = True
                if parent.state == "orchestrating":
                    with parent.lock:
                        parent.state = "cancelled"
                        parent.error = run.error or "Specialist workflow cancelled; no proposed actions were approved."
                        parent.event("orchestration_cancelled")
                self._save(run)
                continue
            if parent.state == "needs_plan_approval":
                run.state = "awaiting_parent_approval"
                run.active_child = None
                self._save(run)
                continue
            if parent.state != "orchestrating":
                self._fail(run, None, "Specialist workflow stopped before parent approval.")
                continue
            for child in run.children:
                if child["status"] == "running":
                    child["status"] = "pending"
                    child["result"] = None
                    child["error"] = None
            run.active_child = None
            run.state = "running"
            self._save(run)
            if self.background:
                self._launch(run.parent_id)
            else:
                self._run(run.parent_id)

    def create(self, project, prompt, model, request_id, mode=None) -> ParentRun:
        mode = mode or "classic"
        if mode != "classic" and not buffy.valid_mode(mode):
            raise ValueError("unknown agent mode")
        if not valid_id(project):
            raise ValueError("bad project id")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt is required")
        if len(prompt) > 20_000:
            raise ValueError("prompt too long")
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 64:
            raise ValueError("request_id must be a non-empty string of at most 64 characters")
        with self.lock:
            existing_id = self.request_ids.get(request_id)
            if existing_id:
                return self.runs[existing_id]
            if request_id in self.agents.rids:
                raise RuntimeError("request id already belongs to another agent")
            catalog.resolve(model)
            if is_chitchat(prompt):
                raise ChitChat("That looks like a greeting, not a task. Describe what to build, or use Chat to talk.")
            if len(self.agents.running()) >= self.agents.MAX_PARALLEL:
                raise RuntimeError("parallel agent limit reached")
            parent_id = "a" + uuid.uuid4().hex[:8]
            run = ParentRun(parent_id, project, prompt, model, request_id, mode=mode)
            if mode != "classic":
                run.children = [buffy.child(role) for role in buffy.MODES[mode]]
            self.runs[parent_id] = run
            self.request_ids[request_id] = parent_id
            self._save(run)
            try:
                self.agents.create_deferred(project, prompt, model=model, rid=request_id, aid=parent_id)
            except Exception:
                run.state = "failed"
                run.error = "Specialist workflow could not be started."
                self._save(run)
                raise
            run.state = "running"
            self._save(run)
        if self.background:
            self._launch(parent_id)
        else:
            self._run(parent_id)
        return run

    def _launch(self, parent_id: str) -> None:
        with self.lock:
            thread = self.threads.get(parent_id)
            if thread is not None and thread.is_alive():
                return
            thread = threading.Thread(target=self._run, args=(parent_id,), daemon=True, name=f"fc-specialists-{parent_id}")
            self.threads[parent_id] = thread
            thread.start()

    def wait(self, parent_id: str, timeout: float = 5.0) -> bool:
        with self.lock:
            thread = self.threads.get(parent_id)
        if thread is not None:
            thread.join(timeout=max(0.0, timeout))
            return not thread.is_alive()
        return self.get(parent_id).state not in ("queued", "running")

    def get(self, parent_id: str) -> ParentRun:
        with self.lock:
            if parent_id not in self.runs:
                raise KeyError(parent_id)
            return self.runs[parent_id]

    def snapshot(self, parent_id: str) -> dict:
        return self.get(parent_id).public_dict()

    def cancel(self, parent_id: str) -> bool:
        with self.lock:
            run = self.get(parent_id)
            if run.state not in ("queued", "running"):
                return False
            run.cancel_requested = True
            run.state = "cancelled"
            if run.active_child:
                child = next((item for item in run.children if item["role"] == run.active_child), None)
                if child is not None:
                    child["status"] = "cancelled"
                    child["error"] = "Cancelled by the owner."
            run.active_child = None
            run.error = "Specialist workflow cancelled; no proposed actions were approved."
            try:
                parent = self.agents.get(parent_id)
                with parent.lock:
                    parent.state = "cancelled"
                    parent.error = run.error
                    parent.event("orchestration_cancelled")
            except KeyError:
                pass
            self._save(run)
            return True

    def _cancelled(self, run: ParentRun) -> bool:
        with self.lock:
            return run.cancel_requested or run.state == "cancelled"

    def _read_context(self, parent) -> str:
        root = Path(self.agents.ws.worktree_dir(parent.project, parent.id)).resolve()
        if not root.is_dir():
            return ""
        excluded_dirs = {".git", "node_modules", "vendor", "dist", "build", ".venv", "venv", "data", "secrets", "__pycache__"}
        allowed_suffixes = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".md", ".json", ".toml", ".yaml", ".yml"}
        context_parts = []
        total = 0
        scanned = 0
        try:   # AGENTS.md (project instructions) always goes first so the file-scan limits can never drop it
            agents_md = safe_path(root, "AGENTS.md")
            if agents_md.is_file() and not agents_md.is_symlink():
                with agents_md.open("rb") as source:
                    text = source.read(MAX_CONTEXT_FILE_CHARS * 4).decode("utf-8", errors="replace")[:MAX_CONTEXT_FILE_CHARS]
                if text.strip():
                    context_parts.append(f"--- AGENTS.md ---\n{text}"); total += len(context_parts[0])
        except (OSError, ValueError):
            pass
        for directory, subdirs, files in os.walk(root, followlinks=False):
            subdirs[:] = sorted(name for name in subdirs if name.lower() not in excluded_dirs and not (Path(directory) / name).is_symlink())[:16]
            for name in sorted(files):
                scanned += 1
                if scanned > 96 or len(context_parts) >= MAX_CONTEXT_FILES or total >= MAX_CONTEXT_CHARS:
                    break
                path = Path(directory) / name
                relative = path.relative_to(root).as_posix()
                lower = relative.lower()
                if relative == "AGENTS.md":
                    continue
                if path.is_symlink() or any(token in lower for token in (".env", "secret", "token", "credential", "private", "password", "apikey", "api-key", "lock")):
                    continue
                if path.suffix.lower() not in allowed_suffixes:
                    continue
                try:
                    safe = safe_path(root, relative)
                    with safe.open("rb") as source:
                        raw = source.read(MAX_CONTEXT_FILE_CHARS * 4)
                    text = raw.decode("utf-8", errors="replace")[:MAX_CONTEXT_FILE_CHARS]
                except (OSError, ValueError):
                    continue
                if not text.strip():
                    continue
                remaining = MAX_CONTEXT_CHARS - total
                section = f"--- {relative} ---\n{text[:remaining]}"
                context_parts.append(section)
                total += len(section)
            if scanned > 96 or len(context_parts) >= MAX_CONTEXT_FILES or total >= MAX_CONTEXT_CHARS:
                break
        return "\n\n".join(context_parts)[:MAX_CONTEXT_CHARS]

    def _messages(self, role: str, run: ParentRun, context: str, prior: dict) -> list[dict]:
        data = {"task": run.prompt[:MAX_PROMPT_CHARS]}
        if role in ("discover", "plan", "implement"):
            data["project_context"] = context[:MAX_CONTEXT_CHARS]
        if role in ("plan", "implement"):
            data["discover"] = prior.get("discover", {})
        if role == "implement":
            data["plan"] = prior.get("plan", {})
        if role == "verify":
            data["proposal"] = {
                "summary": (run.proposal or {}).get("summary", ""),
                "steps": (run.proposal or {}).get("steps", []),
                "actions": [
                    {key: value for key, value in action.items() if key in ("type", "path", "command")}
                    for action in (run.proposal or {}).get("actions", [])
                ],
            }
        user = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        system = SYSTEM_PROMPTS[role]
        total = len(user) + len(system)
        if total > MAX_CHILD_INPUT_CHARS:
            if "project_context" in data:
                overflow = total - MAX_CHILD_INPUT_CHARS
                data["project_context"] = data["project_context"][:max(0, len(data["project_context"]) - overflow)]
                user = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                total = len(user) + len(system)
            if total > MAX_CHILD_INPUT_CHARS:
                raise ValueError("specialist input exceeds its shared context limit")
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    @staticmethod
    def _result(role: str, value) -> dict:
        if role == "discover":
            return {"summary": value.summary, "findings": list(value.findings)}
        if role == "plan":
            return {"summary": value.summary, "steps": list(value.steps)}
        if role == "implement":
            actions = []
            for action in value.actions:
                item = {"type": action.type}
                if action.type == "write_file":
                    item.update({"path": action.path, "bytes": len(action.content.encode("utf-8"))})
                else:
                    item["command"] = action.command
                actions.append(item)
            return {"summary": value.summary, "steps": list(value.steps), "proposed_actions": actions}
        return {"status": value.status, "findings": list(value.findings)}

    def _fail(self, run: ParentRun, role: str | None, message: str) -> None:
        with self.lock:
            if run.cancel_requested or run.state == "cancelled":
                run.state = "cancelled"
                run.active_child = None
                if role:
                    child = next((item for item in run.children if item["role"] == role), None)
                    if child is not None and child["status"] == "running":
                        child["status"] = "cancelled"
                        child["error"] = "Cancelled by the owner."
                self._save(run)
                return
            run.state = "failed"
            run.active_child = None
            run.error = message
            if role:
                child = next((item for item in run.children if item["role"] == role), None)
                if child is not None:
                    child["status"] = "failed"
                    child["error"] = "Specialist output was invalid, unavailable, or failed verification."
            try:
                parent = self.agents.get(run.parent_id)
                with parent.lock:
                    if parent.state == "orchestrating":
                        parent.state = "error"
                        parent.error = message
                        parent.event("orchestration_failed", role=role)
            except KeyError:
                pass
            self._save(run)

    def _run(self, parent_id: str) -> None:
        run = self.get(parent_id)
        try:
            parent = self.agents.get(parent_id)
        except KeyError:
            self._fail(run, None, "Specialist workflow could not find its parent run.")
            return
        if self._cancelled(run):
            return
        with self.lock:
            if self._cancelled(run):
                return
            run.state = "running"
            self._save(run)
        if run.mode != "classic":
            self._run_buffy(run, parent)
            return
        try:
            context = self._read_context(parent)
        except Exception:
            self._fail(run, None, "Specialist workflow could not read its bounded project context.")
            return
        prior: dict[str, dict] = {}
        for child in run.children:
            role = child["role"]
            if child["status"] == "completed":
                if child["result"] is not None:
                    prior[role] = child["result"]
                continue
            if self._cancelled(run):
                return
            with self.lock:
                if run.provider_calls >= MAX_PROVIDER_CALLS:
                    self._fail(run, role, "Specialist workflow reached its shared provider-call limit.")
                    return
                run.active_child = role
                run.max_active_children = max(run.max_active_children, 1)
                run.provider_calls += 1
                child["status"] = "running"
                child["error"] = None
                self._save(run)
            try:
                messages = self._messages(role, run, context, prior)
                child_input_chars = sum(len(item.get("content", "")) for item in messages)
                if child_input_chars > MAX_CHILD_INPUT_CHARS:
                    raise ValueError("specialist input exceeds its shared context limit")
                result, _route = self.router.complete_typed(
                    run.model,
                    messages,
                    schema=SCHEMAS[role],
                    skill="code" if role == "implement" else "plan",
                    retries=1,
                    max_provider_attempts=3,
                )
                serialized = json.dumps(result.model_dump(), ensure_ascii=False, separators=(",", ":"))
                if len(serialized) > MAX_CHILD_OUTPUT_CHARS:
                    raise ValueError("specialist output exceeds its shared limit")
                public_result = self._result(role, result)
                if len(json.dumps(public_result, ensure_ascii=False)) > MAX_CHILD_RESULT_CHARS:
                    raise ValueError("specialist progress output exceeds its limit")
                with self.lock:
                    if self._cancelled(run):
                        child["status"] = "cancelled"
                        child["error"] = "Cancelled by the owner."
                        run.active_child = None
                        self._save(run)
                        return
                    child["input_chars"] = child_input_chars
                    child["output_chars"] = len(serialized)
                    child["result"] = public_result
                    if role == "implement":
                        run.proposal = result.model_dump()
                    if role == "verify" and result.status != "passed":
                        child["status"] = "failed"
                        child["error"] = "The proposed plan did not pass specialist verification."
                        run.state = "failed"
                        run.active_child = None
                        run.error = "Specialist verification failed; no parent plan approval is available."
                        with parent.lock:
                            if parent.state == "orchestrating":
                                parent.state = "error"
                                parent.error = run.error
                                parent.event("orchestration_verification_failed")
                        self._save(run)
                        return
                    child["status"] = "completed"
                    run.active_child = None
                    prior[role] = public_result
                    self._save(run)
            except Exception:
                self._fail(run, role, "Specialist workflow stopped; no parent plan approval is available.")
                return

        if self._cancelled(run):
            return
        self._propose(run, parent)

    def _propose(self, run: ParentRun, parent) -> None:
        proposal = run.proposal
        if not proposal or not proposal.get("actions"):
            self._fail(run, "implement", "Specialist workflow produced no valid parent plan.")
            return
        actions = []
        for action in proposal["actions"]:
            item = dict(action, status="pending", result=None)
            item["risk"] = self.agents._risk(parent, item)
            actions.append(item)
        with self.lock:
            if self._cancelled(run):
                return
            with parent.lock:
                if parent.state != "orchestrating":
                    self._fail(run, None, "Parent state changed before plan approval became available.")
                    return
                parent.plan = {"summary": proposal["summary"], "steps": list(proposal["steps"])}
                parent.actions = actions
                parent.state = "needs_plan_approval"
                parent.error = None
                parent.event("orchestration_plan_ready", actions=len(actions))
            run.state = "awaiting_parent_approval"
            run.active_child = None
            self._save(run)

    # ----- Buffy multi-agent modes (base2, lite, max, plan); see freecode/buffy.py -----

    @staticmethod
    def _fit(result: dict) -> dict:
        while len(json.dumps(result, ensure_ascii=False)) > MAX_CHILD_RESULT_CHARS:
            lists = [key for key, value in result.items() if isinstance(value, list) and value]
            if not lists:
                result["summary"] = str(result.get("summary", ""))[:500]
                break
            longest = max(lists, key=lambda key: len(json.dumps(result[key], ensure_ascii=False)))
            result[longest] = result[longest][:-1]
        return result

    def _buffy_messages(self, role: str, run: ParentRun, root: Path, local: dict) -> list[dict]:
        picks = (local.get("file_picker") or {}).get("files", [])
        data = {"task": run.prompt[:MAX_PROMPT_CHARS]}
        if role == "reviewer":
            data["proposal"] = {
                "summary": (run.proposal or {}).get("summary", ""),
                "steps": (run.proposal or {}).get("steps", []),
                "actions": [{k: v for k, v in a.items() if k in ("type", "path", "command")} for a in (run.proposal or {}).get("actions", [])],
            }
        else:
            data["picked_files"] = picks
            data["search_hits"] = (local.get("code_searcher") or {}).get("hits", [])
            data["docs"] = (local.get("researcher") or {}).get("notes", [])
            if role != "thinker" and local.get("thinker"):
                data["analysis"] = local["thinker"]
            excerpts, total = [], 0
            for rel in picks:
                text = buffy._read(root, rel)[:MAX_CONTEXT_FILE_CHARS]
                if not text.strip() or total >= MAX_CONTEXT_CHARS:
                    continue
                excerpts.append(f"--- {rel} ---\n{text[:MAX_CONTEXT_CHARS - total]}")
                total += len(excerpts[-1])
            data["file_excerpts"] = excerpts
        system = buffy.PROMPTS[role]
        user = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        while len(user) + len(system) > MAX_CHILD_INPUT_CHARS:
            shrinkable = [k for k in ("file_excerpts", "search_hits", "docs") if data.get(k)]
            if not shrinkable:
                raise ValueError("specialist input exceeds its shared context limit")
            data[shrinkable[0]] = data[shrinkable[0]][:-1]
            user = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def _write_handoff(self, run: ParentRun) -> None:
        if self.store is None:
            return
        data = run.to_dict()
        base = self._path(run.parent_id)
        for suffix, text in ((".handoff.json", json.dumps(data, ensure_ascii=False, indent=2)), (".handoff.md", buffy.handoff_markdown(data))):
            target = base.with_name(run.parent_id + suffix)
            temporary = target.with_name(target.name + ".tmp")
            temporary.write_text(text[:MAX_RUN_FILE_BYTES], encoding="utf-8")
            os.replace(temporary, target)

    def _run_buffy(self, run: ParentRun, parent) -> None:
        root = Path(self.agents.ws.worktree_dir(parent.project, parent.id)).resolve()
        limit = buffy.CALL_LIMITS[run.mode]
        with self.lock:
            run.provider_calls = 0
            run.proposal = None
            for item in run.children:
                item.update(status="pending", result=None, error=None)
            self._save(run)
        try:
            cmap = buffy.code_map(root) if root.is_dir() else {}
        except Exception:
            self._fail(run, None, "Specialist workflow could not read its bounded project context.")
            return
        index = None
        if self.store is not None and root.is_dir():
            try:
                from .code_index import CodeIndex
                index = CodeIndex(self.store.parent / "index" / f"{parent.project}-{parent.id}.sqlite")
                index.refresh(root)
            except Exception:
                index = None
        local: dict[str, dict] = {}
        candidates: dict[str, dict] = {}
        for child in run.children:
            role = child["role"]
            if self._cancelled(run):
                return
            with self.lock:
                if role in buffy.MODEL_AGENTS:
                    if run.provider_calls >= limit:
                        self._fail(run, role, "Specialist workflow reached its shared provider-call limit.")
                        return
                    run.provider_calls += 1
                run.active_child = role
                run.max_active_children = max(run.max_active_children, 1)
                child["status"] = "running"
                self._save(run)
            try:
                if role == "file_picker":
                    result = buffy.file_picker(run.prompt, cmap, index)
                elif role == "code_searcher":
                    result = buffy.code_searcher(root, run.prompt, cmap, index)
                elif role == "researcher":
                    result = buffy.researcher(root, run.prompt)
                elif role == "selector":
                    if not candidates:
                        raise ValueError("no valid editor proposals")
                    name, chosen = buffy.select_best(candidates, (local.get("file_picker") or {}).get("files", []))
                    run.proposal = json.loads(json.dumps(chosen))
                    result = {"summary": f"Selected the {name.split('_', 1)[-1]} strategy from {len(candidates)} valid proposal(s).",
                              "findings": [f"{n}: {len(p['actions'])} action(s)" for n, p in candidates.items()]}
                elif role == "basher":
                    result = buffy.basher(root, run.proposal)
                    if run.proposal:
                        existing = {a.get("command") for a in run.proposal["actions"]}
                        for command in result["commands"]:
                            if command not in existing and len(run.proposal["actions"]) < buffy.MAX_ACTIONS:
                                run.proposal["actions"].append({"type": "run_command", "command": command})
                else:
                    messages = self._buffy_messages(role, run, root, local)
                    value, _route = self.router.complete_typed(
                        run.model, messages, schema=buffy.SCHEMAS[role],
                        skill="code" if role in buffy.EDITOR_STRATEGIES else "plan",
                        retries=0, max_provider_attempts=1,
                    )
                    dumped = value.model_dump()
                    if len(json.dumps(dumped, ensure_ascii=False)) > MAX_CHILD_OUTPUT_CHARS:
                        raise ValueError("specialist output exceeds its shared limit")
                    child["input_chars"] = sum(len(m["content"]) for m in messages)
                    child["output_chars"] = len(json.dumps(dumped, ensure_ascii=False))
                    result = buffy.public(role, value)
                    if role in buffy.EDITOR_STRATEGIES:
                        candidates[role] = dumped
                        if run.mode != "max":
                            run.proposal = dumped
                    if role == "planner":
                        run.proposal = {"summary": value.summary, "steps": list(value.steps), "actions": []}
                    if role == "reviewer" and value.status != "passed":
                        with self.lock:
                            child["status"] = "failed"
                            child["result"] = self._fit(result)
                            child["error"] = "The proposal did not pass review."
                            run.state = "failed"
                            run.active_child = None
                            run.error = "Reviewer found problems; no parent plan approval is available."
                            with parent.lock:
                                if parent.state == "orchestrating":
                                    parent.state = "error"
                                    parent.error = run.error
                                    parent.event("orchestration_verification_failed")
                            self._save(run)
                        self._write_handoff(run)
                        return
            except Exception:
                if run.mode == "max" and role in buffy.EDITOR_STRATEGIES:
                    with self.lock:
                        child["status"] = "failed"
                        child["error"] = "This editor strategy produced no valid proposal."
                        run.active_child = None
                        self._save(run)
                    continue
                self._fail(run, role, "Specialist workflow stopped; no parent plan approval is available.")
                self._write_handoff(run)
                return
            with self.lock:
                if self._cancelled(run):
                    child["status"] = "cancelled"
                    child["error"] = "Cancelled by the owner."
                    run.active_child = None
                    self._save(run)
                    return
                child["result"] = self._fit(result)
                child["status"] = "completed"
                run.active_child = None
                local[role] = result
                self._save(run)
        if self._cancelled(run):
            return
        if run.mode == "plan":
            plan = run.proposal or {}
            with self.lock:
                with parent.lock:
                    if parent.state != "orchestrating":
                        self._fail(run, None, "Parent state changed before the plan was ready.")
                        return
                    parent.plan = {"summary": plan.get("summary", ""), "steps": list(plan.get("steps", []))}
                    parent.actions = []
                    parent.state = "planned"
                    parent.error = None
                    parent.event("orchestration_plan_only")
                run.state = "planned"
                run.active_child = None
                self._save(run)
            self._write_handoff(run)
            return
        self._propose(run, parent)
        self._write_handoff(run)
