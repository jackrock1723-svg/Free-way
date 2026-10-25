"""Credentials for deploy hosts, the user's GitHub App and research keys. Stored in a 0600 file in the data dir,
never returned by the API (status only), never logged."""
import json, os, re
from pathlib import Path
from .deploy import HOSTS

KINDS = {f"deploy:{h}": v["fields"] for h, v in HOSTS.items()}
KINDS["github_app"] = ["app_id", "private_key"]
KINDS["search"] = ["tavily", "jina"]
ENV = {"search": {"tavily": "TAVILY_API_KEY", "jina": "JINA_API_KEY"}}

class Integrations:
    def __init__(self, data):
        self.file = Path(data) / "integrations.json"; self.saved = {}
        if self.file.exists():
            try: self.saved = {k: v for k, v in json.loads(self.file.read_text(encoding="utf-8")).items() if k in KINDS and isinstance(v, dict)}
            except ValueError: self.saved = {}

    def get(self, kind):
        """Credentials for internal use only (adapters). Env values fill gaps and are never persisted."""
        d = dict(self.saved.get(kind, {}))
        for f, env in ENV.get(kind, {}).items():
            if not d.get(f) and os.environ.get(env): d[f] = os.environ[env]
        return d

    def set(self, kind, values):
        if kind not in KINDS: raise ValueError("unknown integration")
        if not values: self.saved.pop(kind, None)
        else:
            if not isinstance(values, dict): raise ValueError("values must be an object")
            clean = {}
            for f in KINDS[kind]:
                v = values.get(f)
                if v in (None, ""): continue
                if not isinstance(v, str) or len(v) > 8000: raise ValueError(f"{f} is not valid")
                v = v.strip()
                if f not in ("private_key", "app_id") and (len(v) < 4 or any(c.isspace() for c in v)): raise ValueError(f"{f} does not look right")
                if f == "private_key" and "PRIVATE KEY-----" not in v: raise ValueError("paste the whole .pem private key")
                if f == "app_id" and not v.isdigit(): raise ValueError("GitHub App ID must be a number")
                if f == "deploy_hook" and not re.match(r"^https://api\.render\.com/deploy/srv-[\w-]+\?key=[\w-]+$", v): raise ValueError("that is not a Render deploy hook URL")
                clean[f] = v
            if not clean: raise ValueError("nothing to save")
            self.saved[kind] = clean
        self.file.write_text(json.dumps(self.saved), encoding="utf-8"); os.chmod(self.file, 0o600)
        return self.status()

    def status(self):
        out = {}
        for kind, fields in KINDS.items():
            d = self.get(kind)
            out[kind] = {"configured": all(d.get(f) for f in fields) if kind != "search" else any(d.get(f) for f in fields),
                         "fields": {f: bool(d.get(f)) for f in fields}}
        out["hosts"] = {h: {"name": v["name"], "note": v["note"], "fields": v["fields"]} for h, v in HOSTS.items()}
        return out
