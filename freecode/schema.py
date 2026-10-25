"""Free way typed AI layer: every model output is validated against a strict schema.

Invalid output is repaired by sending the validation errors back to the model (up to N retries),
then the router falls back to the next free model, and finally raises a clear user-facing error."""
import json, re
from typing import Annotated, List, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from .safety import check_command, UnsafeAction

MAX_FILE = 512 * 1024

class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=False)

class WriteFile(Strict):
    type: Literal["write_file"]
    path: Annotated[str, Field(min_length=1, max_length=200)]
    content: Annotated[str, Field(max_length=MAX_FILE)]
    @field_validator("content")
    @classmethod
    def _nonempty(cls, v):
        if not v.strip(): raise ValueError("file content is empty: write the complete file")
        return v
    @field_validator("path")
    @classmethod
    def _rel(cls, v):
        p = v.replace("\\", "/")
        if p.startswith("/") or re.match(r"^[A-Za-z]:", p): raise ValueError("path must be relative")
        if any(seg in ("..", "") for seg in p.split("/")): raise ValueError("path must not contain '..' or empty segments")
        if p.split("/")[0] == ".git": raise ValueError("path must not touch .git")
        if any(ord(c) < 32 for c in p): raise ValueError("path has control characters")
        return p

class RunCommand(Strict):
    type: Literal["run_command"]
    command: Annotated[str, Field(min_length=1, max_length=400)]
    @field_validator("command")
    @classmethod
    def _safe(cls, v):
        try: check_command(v)
        except UnsafeAction as e: raise ValueError(f"command not allowed: {e}")
        return v

Action = Annotated[Union[WriteFile, RunCommand], Field(discriminator="type")]

class Plan(Strict):
    summary: Annotated[str, Field(min_length=1, max_length=300)]
    steps: Annotated[List[Annotated[str, Field(min_length=1, max_length=300)]], Field(min_length=1, max_length=20)]
    actions: Annotated[List[Action], Field(min_length=1, max_length=40)]

class SchemaError(ValueError):
    """Model output that is not valid JSON or does not match the schema. `.feedback` is sent back to the model."""
    def __init__(self, msg, feedback):
        super().__init__(msg); self.feedback = feedback

def extract_json(text):
    if not isinstance(text, str) or not text.strip():
        raise SchemaError("empty reply", "Your reply was empty. Reply with ONE JSON object only.")
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m: t = m.group(1)
    i = t.find("{")
    if i < 0: raise SchemaError("no JSON object", "Your reply contained no JSON object. Reply with ONE JSON object only, no prose.")
    try: d, _ = json.JSONDecoder(strict=False).raw_decode(t[i:])   # models often put raw newlines in strings
    except ValueError as e: raise SchemaError(f"invalid JSON: {e}", f"Your reply was not valid JSON ({e}). Reply with ONE valid JSON object only.")
    if not isinstance(d, dict): raise SchemaError("JSON is not an object", "The top level must be a JSON object.")
    return d

def _fmt(err: ValidationError, limit=12):
    out = []
    for e in err.errors()[:limit]:
        loc = ".".join(str(x) for x in e["loc"]) or "(root)"
        out.append(f"- {loc}: {e['msg']}")
    more = len(err.errors()) - limit
    if more > 0: out.append(f"- ... and {more} more")
    return "\n".join(out)

def validate(text, schema=Plan):
    d = extract_json(text)
    try: return schema.model_validate(d)
    except ValidationError as e:
        lines = _fmt(e)
        raise SchemaError(f"schema validation failed ({len(e.errors())} errors)",
                          "Your JSON did not match the required schema:\n" + lines +
                          "\nReturn the COMPLETE corrected JSON object only, with exactly the fields "
                          '{"summary","steps","actions"}; each action is {"type":"write_file","path","content"} or {"type":"run_command","command"}.')

def plan_dict(p: Plan):
    return {"summary": p.summary, "steps": list(p.steps), "actions": [a.model_dump() for a in p.actions]}

from pydantic import model_validator

class BuildPlan(Plan):
    """Plan for a build task: must create or change at least one file (a plan of only `ls` is useless)."""
    @model_validator(mode="after")
    def _writes(self):
        if not any(a.type == "write_file" for a in self.actions):
            raise ValueError("a build plan must include at least one write_file action with the full file content")
        return self
