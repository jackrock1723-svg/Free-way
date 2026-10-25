"""Connector credentials (0600 file, never returned), drafts that need explicit approval before anything is sent,
the OAuth code flow for your own app, and an audit log of every send."""
import hashlib, hmac, json, os, secrets, threading, time, urllib.parse
from pathlib import Path
from .base import REGISTRY, ConnectorError, get, http

class ConnectorStore:
    def __init__(self, root, secret="local", clock=time.time):
        self.root = Path(root); self.root.mkdir(parents=True, exist_ok=True); self.secret = secret.encode(); self.clock = clock
        self.lock = threading.RLock(); self.creds = self._read("connectors.json", {}); self.drafts = self._read("drafts.json", {})
    def _read(self, name, default):
        f = self.root / name
        try: return json.loads(f.read_text(encoding="utf-8")) if f.exists() else default
        except ValueError: return default
    def _write(self, name, obj):
        f = self.root / name; tmp = f.with_suffix(".tmp"); tmp.write_text(json.dumps(obj), encoding="utf-8"); os.chmod(tmp, 0o600); tmp.replace(f)
    def _audit(self, rec):
        with open(self.root / "audit.jsonl", "a", encoding="utf-8") as f: f.write(json.dumps(dict(rec, at=round(self.clock(), 3))) + "\n")
        os.chmod(self.root / "audit.jsonl", 0o600)

    # ----- setup -----
    def gallery(self):
        out = []
        for cid, cls in REGISTRY.items():
            c = self.creds.get(cid, {})
            out.append({"id": cid, "name": cls.name, "group": cls.group, "blurb": cls.blurb, "auth": cls.auth, "fields": cls.fields, "secret_fields": cls.secret_fields,
                        "docs": cls.docs, "can": list(cls.can), "draft_fields": list(cls.draft_fields),
                        "connected": bool(c.get("access_token")) if cls.auth == "oauth" else all(c.get(f) for f in cls.fields if f not in cls.optional), "optional": list(cls.optional),
                        "app_ready": cls.auth == "oauth" and all(c.get(f) for f in cls.fields), "account": c.get("_account")})
        return out
    def connector(self, cid):
        cls = get(cid); return cls(self.creds.get(cid, {}))
    def setup(self, cid, values):
        cls = get(cid)
        if values is None:
            with self.lock: self.creds.pop(cid, None); self._write("connectors.json", self.creds); self._audit({"kind": "disconnect", "connector": cid}); return
        if not isinstance(values, dict): raise ConnectorError("values must be an object")
        clean = {}
        for f in cls.fields:
            v = values.get(f)
            if v in (None, ""): continue
            if not isinstance(v, str) or len(v) > 4000 or (f in cls.secret_fields and any(ch.isspace() for ch in v.strip())): raise ConnectorError(f"{f.replace('_', ' ')} does not look right")
            clean[f] = v.strip()
        if not clean: raise ConnectorError("nothing to save")
        with self.lock:
            cur = dict(self.creds.get(cid, {})); cur.update(clean); self.creds[cid] = cur; self._write("connectors.json", self.creds)
        self._audit({"kind": "setup", "connector": cid, "fields": sorted(clean)})
    def test(self, cid):
        return bool(self.connector(cid).check())

    # ----- OAuth (your own app; Free way never holds a shared client secret) -----
    def _state(self, cid, exp): return f"{cid}.{exp}.{hmac.new(self.secret, f'oauth:{cid}:{exp}'.encode(), 'sha256').hexdigest()[:32]}"
    def oauth_start(self, cid, redirect_uri):
        cls = get(cid); c = self.creds.get(cid, {})
        if cls.auth != "oauth": raise ConnectorError("this connector uses a token, not OAuth")
        if not c.get("client_id") or not c.get("client_secret"): raise ConnectorError(f"add your app's client ID and secret first ({cls.oauth['console']})")
        exp = int(self.clock()) + 600
        qs = {"client_id": c["client_id"], "redirect_uri": redirect_uri, "response_type": "code", "scope": " ".join(cls.oauth["scopes"]), "state": self._state(cid, exp)}
        qs.update(cls.oauth.get("extra", {}))
        return cls.oauth["authorize"] + "?" + urllib.parse.urlencode(qs)
    def oauth_finish(self, state, code, redirect_uri):
        try: cid, exp, sig = str(state).split(".")
        except ValueError: raise ConnectorError("bad sign-in state", 400)
        if not hmac.compare_digest(state, self._state(cid, int(exp))) or int(exp) < self.clock(): raise ConnectorError("the sign-in link expired; start again", 400)
        cls = get(cid); c = self.creds.get(cid, {})
        tok = http("POST", cls.oauth["token"](), None, {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri,
                                                        "client_id": c.get("client_id"), "client_secret": c.get("client_secret")}, form=True)
        if not tok.get("access_token"): raise ConnectorError("the service did not return a token", 502)
        with self.lock:
            cur = dict(self.creds.get(cid, {})); cur.update(access_token=tok["access_token"], refresh_token=tok.get("refresh_token") or cur.get("refresh_token"),
                                                            expires_at=int(self.clock()) + int(tok.get("expires_in") or 3600))
            self.creds[cid] = cur; self._write("connectors.json", self.creds)
        self._audit({"kind": "oauth_connected", "connector": cid}); return cid
    def refresh_if_needed(self, cid):
        cls = get(cid); c = self.creds.get(cid, {})
        if cls.auth != "oauth" or not c.get("refresh_token") or c.get("expires_at", 0) > self.clock() + 60: return
        tok = http("POST", cls.oauth["token"](), None, {"grant_type": "refresh_token", "refresh_token": c["refresh_token"], "client_id": c.get("client_id"), "client_secret": c.get("client_secret")}, form=True)
        with self.lock:
            c = dict(c); c.update(access_token=tok["access_token"], expires_at=int(self.clock()) + int(tok.get("expires_in") or 3600)); self.creds[cid] = c; self._write("connectors.json", self.creds)

    # ----- agent tools: read, search, draft (never send) -----
    def search(self, cid, query, limit=10):
        self.refresh_if_needed(cid); cls = get(cid)
        if "search" not in cls.can: raise ConnectorError("search is not available for " + cls.name)
        return self.connector(cid).search(str(query or "")[:500], max(1, min(int(limit or 10), 25)))
    def read(self, cid, item_id):
        self.refresh_if_needed(cid); return self.connector(cid).read(str(item_id)[:300])
    def draft(self, cid, fields, origin="user", agent=None):
        cls = get(cid)
        if "send" not in cls.can: raise ConnectorError(f"{cls.name} is read-only in Free way")
        d = cls(self.creds.get(cid, {})).validate_draft(fields or {})
        did = "d" + secrets.token_hex(6)
        rec = {"id": did, "connector": cid, "name": cls.name, "fields": d, "status": "pending", "origin": origin, "agent": agent, "created": round(self.clock(), 3)}
        with self.lock: self.drafts[did] = rec; self._write("drafts.json", self.drafts)
        self._audit({"kind": "draft", "connector": cid, "draft": did, "origin": origin}); return rec
    def list_drafts(self, status=None):
        return sorted([d for d in self.drafts.values() if not status or d["status"] == status], key=lambda d: -d["created"])
    def edit_draft(self, did, fields):
        with self.lock:
            d = self.drafts.get(did)
            if not d: raise ConnectorError("draft not found", 404)
            if d["status"] != "pending": raise ConnectorError("only pending drafts can be edited", 409)
            d["fields"] = get(d["connector"])(self.creds.get(d["connector"], {})).validate_draft(dict(d["fields"], **(fields or {})))
            self._write("drafts.json", self.drafts); return d
    def discard(self, did):
        with self.lock:
            d = self.drafts.get(did)
            if not d: raise ConnectorError("draft not found", 404)
            if d["status"] == "sent": raise ConnectorError("already sent", 409)
            d["status"] = "discarded"; self._write("drafts.json", self.drafts); return d
    def approve_and_send(self, did, confirm):
        """The ONLY path that sends anything. Requires an explicit confirm from the person, per draft."""
        if confirm is not True: raise ConnectorError("sending needs your explicit approval", 403)
        with self.lock:
            d = self.drafts.get(did)
            if not d: raise ConnectorError("draft not found", 404)
            if d["status"] != "pending": raise ConnectorError(f"this draft is {d['status']}", 409)
            d["status"] = "sending"; self._write("drafts.json", self.drafts)
        try:
            self.refresh_if_needed(d["connector"])
            res = self.connector(d["connector"]).send(d["fields"])
        except ConnectorError as e:
            with self.lock: d["status"] = "pending"; d["error"] = str(e); self._write("drafts.json", self.drafts)
            self._audit({"kind": "send_failed", "connector": d["connector"], "draft": did}); raise
        with self.lock:
            d.update(status="sent", sent=round(self.clock(), 3), result=res, error=None); self._write("drafts.json", self.drafts)
        self._audit({"kind": "sent", "connector": d["connector"], "draft": did, "approved_by": "user"}); return d

    # ----- WhatsApp inbound (webhook) -----
    def whatsapp_inbound(self, payload):
        added = 0
        for e in payload.get("entry", []):
            for ch in e.get("changes", []):
                names = {c.get("wa_id"): (c.get("profile") or {}).get("name") for c in (ch.get("value") or {}).get("contacts", [])}
                for m in (ch.get("value") or {}).get("messages", []):
                    if m.get("type") != "text": continue
                    with self.lock:
                        c = self.creds.setdefault("whatsapp", {}); box = c.setdefault("_inbox", [])
                        if any(x["id"] == m["id"] for x in box): continue
                        box.append({"id": m["id"], "from": m.get("from"), "title": names.get(m.get("from")) or "+" + str(m.get("from", "")), "name": names.get(m.get("from")), "snippet": m["text"]["body"][:300], "text": m["text"]["body"], "at": m.get("timestamp")})
                        c["_inbox"] = box[-500:]; added += 1
        if added:
            with self.lock: self._write("connectors.json", self.creds)
        return added
