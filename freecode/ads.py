"""Free way's contextual ad service.

Personalised ads require explicit, revocable consent and use interest categories only; raw prompts, code, files,
and contact details are never shared. Normal mode uses no ad adapter unless a publisher is configured. Mock
inventory and demo benefits are restricted to explicit mock/test mode and are not real rewards or funded revenue.
"""
import hashlib, hmac, json, os, re, secrets, threading, time
from pathlib import Path

CONSENT_VERSION = "2026-10-24"
CONSENT_TEXT = ("Personalised ads use interest categories from your Free way activity (for example 'hosting' or 'testing'). "
                "Only these categories are shared with the configured ad publisher; never your prompts, code, files, email or contacts. "
                "No bonus credits or extra runs are offered by this ad service. Turn it off any time in Settings; "
                "your interest profile is deleted when you do.")
MOCK_CONSENT_TEXT = ("This explicit mock mode uses test inventory only. Interest categories from your Free way activity may be used "
                     "to select a deterministic test ad; prompts, code, files, email and contacts are never shared. "
                     "The displayed demo benefits are not real credits or production rewards. Turn it off any time in Settings.")
UNAVAILABLE_CONSENT_TEXT = ("No ad publisher is configured. No ads are served, no interest data is shared, and no ad rewards are "
                            "available in this build. You can still withdraw, export or delete existing ad data below.")
BENEFITS = {"bonus_credits": 50, "bonus_daily_runs": 25, "offers": True}   # Available only in explicit mock mode.

# Ads must help, never annoy: an ad is shown only when it clearly matches the current task, and only at a natural
# pause (plan waiting for approval is NOT a pause; a finished run is). Otherwise no ad at all.
PAUSE_STATES = ("review", "merged")
RUNNING_STATES = ("planning", "needs_plan_approval", "working", "fixing")

# Developer-tool taxonomy. Categories are the only thing ever derived from the task text.
TAXONOMY = {
    "hosting": r"\b(deploy\w*|host\w*|vercel|netlify|server|domain|cdn|static site)\b",
    "databases": r"\b(database|db|sql\w*|postgres\w*|mysql|sqlite|mongo\w*|redis|supabase|storage|localstorage)\b",
    "testing": r"\b(test\w*|assert\w*|jest|pytest|qa|bug\w*|debug\w*)\b",
    "monitoring": r"\b(monitor\w*|logging|logs?|metrics|uptime|alert\w*|error tracking|sentry)\b",
    "auth": r"\b(auth\w*|login|log in|sign[- ]?in|sign[- ]?up|password|oauth|session)\b",
    "payments": r"\b(payment\w*|checkout|stripe|billing|subscription\w*|invoice\w*|shop|cart)\b",
    "ai_apis": r"\b(ai|llm|gpt|model|chatbot|embedding\w*|agent\w*)\b",
    "design": r"\b(design|ui|ux|css|theme|landing page|font\w*|icon\w*|figma)\b",
    "mobile": r"\b(mobile|android|ios|phone|pwa|app store)\b",
    "productivity": r"\b(todo\w*|task\w*|notes?|calendar|kanban|planner)\b",
    "data": r"\b(chart\w*|csv|analytics|dashboard|data|report\w*)\b",
}
_RX = {k: re.compile(v, re.I) for k, v in TAXONOMY.items()}

def relevance(text, category):
    """0..1: how strongly the task text is about one category. 1 clear keyword = 0.5, 2 = 0.8, 3+ = 1."""
    rx = _RX.get(category or "")
    n = len(rx.findall(text or "")) if rx else 0
    return (0.0, 0.5, 0.8)[n] if n < 3 else 1.0

def categories(text, limit=3):
    """Rank taxonomy categories by hits in the task text. Returns category names only."""
    text = text or ""
    scored = sorted(((len(rx.findall(text)), k) for k, rx in _RX.items()), key=lambda x: (-x[0], x[1]))
    return [k for n, k in scored if n][:limit]

_REDACT = [(re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)", re.S), "[secret]"),
           (re.compile(r"\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth)\b\s*[:=]\s*\S+", re.I), "[secret]"),
           (re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/@]+:[^\s/@]+@\S+", re.I), "[secret]"),
           (re.compile(r"\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}"), "[secret]"),
           (re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"), "[secret]"),
           (re.compile(r"\bAIza[\w-]{30,}"), "[secret]"),
           (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"), (re.compile(r"https?://\S+"), "[link]"),
           (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[ip]"),
           (re.compile(r"\b(sk|pk|rk|nvapi|ghp|gho|ghs|github_pat|glpat|xox[abpr])[-_][\w-]{8,}\b", re.I), "[secret]"),
           (re.compile(r"\b[A-Za-z0-9_\-]{32,}\b"), "[secret]"), (re.compile(r"\+?\d[\d \-().]{7,}\d"), "[number]")]

def redact(text, limit=240):
    t = " ".join((text or "").split())
    for rx, rep in _REDACT: t = rx.sub(rep, t)
    return t[:limit]

def micros(usd): return int(round(float(usd) * 1_000_000))
def usd(m): return round(m / 1_000_000, 6)

# ---------- adapters ----------
class AdapterError(Exception): pass

class AdAdapter:
    """Network adapter. request() gets only the minimised payload built by AdService."""
    name = "base"
    def request(self, payload): raise NotImplementedError
    def configured(self): return True

class MockAdapter(AdAdapter):
    """Deterministic demand for tests and demos. Records payloads so tests can check what would be sent."""
    name = "mock"
    INVENTORY = [
        {"cat": "hosting", "advertiser": "Northwind Hosting", "title": "Ship static sites in one command", "text": "Free tier with global CDN and preview URLs.", "url": "https://example.com/northwind", "cpm": 6.0, "cpc": 0.40},
        {"cat": "testing", "advertiser": "Assertly", "title": "Catch failing tests before merge", "text": "Run your suite on every push, free for open source.", "url": "https://example.com/assertly", "cpm": 5.0, "cpc": 0.35},
        {"cat": "databases", "advertiser": "Tablestack", "title": "A free Postgres in 10 seconds", "text": "Branching databases for every agent run.", "url": "https://example.com/tablestack", "cpm": 7.0, "cpc": 0.50},
        {"cat": "monitoring", "advertiser": "Pulseboard", "title": "Know when your app breaks", "text": "Uptime and error alerts, five monitors free.", "url": "https://example.com/pulseboard", "cpm": 5.5, "cpc": 0.30},
        {"cat": "auth", "advertiser": "Gatekey", "title": "Sign-in for your app in minutes", "text": "Passkeys and OAuth, free up to 10k users.", "url": "https://example.com/gatekey", "cpm": 6.5, "cpc": 0.45},
        {"cat": "payments", "advertiser": "Tillflow", "title": "Take payments without the paperwork", "text": "Checkout links that work in 40 countries.", "url": "https://example.com/tillflow", "cpm": 8.0, "cpc": 0.60},
        {"cat": "productivity", "advertiser": "Focusdeck", "title": "Turn your todo app into a product", "text": "Templates and sync APIs for task apps.", "url": "https://example.com/focusdeck", "cpm": 4.0, "cpc": 0.25},
        {"cat": "design", "advertiser": "Palette Pro", "title": "Premium UI kits for builders", "text": "Accessible components, light and dark.", "url": "https://example.com/palette", "cpm": 4.5, "cpc": 0.30},
    ]
    def __init__(self, fill=True, fail=False):
        self.fill = fill; self.fail = fail; self.requests = []
    def request(self, payload):
        self.requests.append(json.loads(json.dumps(payload)))
        if self.fail: raise AdapterError("mock network unavailable")
        if not self.fill: return None
        wanted = list(payload.get("context", {}).get("categories", [])) + list(payload.get("interests", []))
        pool = [x for x in self.INVENTORY if x["cat"] in wanted] or self.INVENTORY
        pick = pool[payload.get("seq", 0) % len(pool)]
        boost = 1.3 if payload.get("interests") else 1.0   # personalised impressions price higher
        return {"advertiser": pick["advertiser"], "title": pick["title"], "text": pick["text"], "url": pick["url"],
                "category": pick["cat"], "cpm_usd": round(pick["cpm"] * boost, 4), "cpc_usd": round(pick["cpc"] * boost, 4)}

class GravityAdapter(AdAdapter):
    """Gravity (trygravity.com): the network Freebuff uses. Gravity's guidelines allow ads only through its SDK,
    so this goes through the official `gravity-sdk` package and needs GRAVITY_API_KEY. It is not exercised live:
    we have no publisher account yet."""
    name = "gravity"
    def __init__(self, api_key=None, production=False, relevancy=0.6):   # strict: Gravity drops weak matches server-side
        self.api_key = api_key or os.environ.get("GRAVITY_API_KEY"); self.production = production; self.relevancy = relevancy
    def configured(self):
        if not self.api_key: return False
        try: import gravity_sdk  # noqa: F401
        except ImportError: return False
        return True
    def request(self, payload):
        if not self.configured(): raise AdapterError("Gravity is not configured: install gravity-sdk and set GRAVITY_API_KEY")
        import asyncio
        from gravity_sdk import Gravity
        ctx = payload["context"]
        msgs = [{"role": "user", "content": ctx["summary"] + (" | topics: " + ", ".join(ctx["categories"]) if ctx["categories"] else "")}]
        body = {"gravity_context": {"sessionId": payload["session"], "user": {"id": payload["anon_id"], **({"interests": payload["interests"]} if payload.get("interests") else {})},
                                    "device": payload.get("device", {})}}
        class _Req:  # the SDK reads gravity_context from the posted body
            def __init__(s, b): s._b = b; s.headers = {}
            async def json(s): return s._b
        async def go():
            g = Gravity(api_key=self.api_key, production=self.production, relevancy=self.relevancy)
            try: return await g.get_ads(_Req(body), msgs, [{"placement": "below_response", "placement_id": payload["placement"]}])
            finally: await g.close()
        res = asyncio.run(go())
        if not res or not getattr(res, "ads", None): return None
        a = res.ads[0].to_dict()
        return {"advertiser": a.get("brandName") or a.get("advertiser") or "", "title": a.get("title") or "", "text": a.get("adText") or a.get("text") or "",
                "url": a.get("clickUrl") or a.get("url") or "", "impression_url": a.get("impUrl"), "category": None, "relevance": self.relevancy, "cpm_usd": None, "cpc_usd": None}

ADAPTERS = {"mock": MockAdapter, "gravity": GravityAdapter}

# ---------- service ----------
DEFAULT_CFG = {"pool_target_usd": 50.0, "surplus_pool_share": 0.3, "min_gap_s": 120, "max_per_day": 12, "max_per_run": 1, "min_relevance": 0.5,
               "enabled": 1, "stack_weight": 0.6}
INT_CFG = ("min_gap_s", "max_per_day", "max_per_run", "enabled")
PRIVACY_NOTICE = ("Free way is free because it shows a few relevant sponsored cards. To pick them, Free way may look at your current task "
                  "and your project's stack (languages, frameworks and well-known packages, e.g. 'React' or 'Postgres'). "
                  "Secrets, keys, file contents, file names and contact details are removed and never sent to an ad network. "
                  "Ads never interrupt a running agent and you can close any ad. Turn stack-based ads off here at any time.")


def score_categories(task_text, stack=None, stack_weight=0.6):
    """Relevance per category (0..1) from the task text plus the project's stack. Both together score highest."""
    scores = {c: relevance(task_text, c) for c in TAXONOMY}
    for cat, weight in ((stack or {}).get("categories") or {}).items():
        if cat not in scores:
            continue
        base = scores[cat]
        stacked = max(base, float(stack_weight) * float(weight))
        scores[cat] = round(min(1.0, stacked + (0.2 if base > 0 and weight > 0 else 0)), 3)
    return sorted(((c, s) for c, s in scores.items() if s > 0), key=lambda cs: (-cs[1], cs[0]))

class AdService:
    def __init__(self, root, adapter=None, secret=None, clock=time.time):
        self.root = Path(root); self.root.mkdir(parents=True, exist_ok=True)
        self.adapter = adapter; self.secret = (secret or "local").encode(); self.clock = clock
        self.lock = threading.RLock()
        self.state_f = self.root / "state.json"; self.ledger_f = self.root / "ledger.jsonl"
        self.state = self._load()

    def _publisher_configured(self):
        try: return self.adapter is not None and bool(self.adapter.configured())
        except Exception: return False

    def _mock_mode(self):
        return isinstance(self.adapter, MockAdapter)

    # persistence
    def _load(self):
        try: s = json.loads(self.state_f.read_text(encoding="utf-8"))
        except (OSError, ValueError): s = {}
        s.setdefault("cfg", dict(DEFAULT_CFG)); s.setdefault("users", {}); s.setdefault("imps", {}); s.setdefault("seq", 0)
        for k, v in DEFAULT_CFG.items(): s["cfg"].setdefault(k, v)
        return s
    def _save(self):
        tmp = self.state_f.with_suffix(".tmp"); tmp.write_text(json.dumps(self.state), encoding="utf-8"); os.replace(tmp, self.state_f)
    def _user(self, uid):
        u = self.state["users"].setdefault(uid, {"consent": {"personalized": False, "version": None, "at": None, "history": []},
                                                  "interests": {}, "credits": 0, "bonus_granted": False, "shown": [], "runs": {}, "anon": secrets.token_hex(8)})
        u.setdefault("privacy", {"use_stack": True}); u.setdefault("signals", None); u.setdefault("closed", 0)
        c = u["consent"]
        if "use_stack" not in c: c["use_stack"] = bool(u["privacy"].get("use_stack", True))   # single source of truth: the consent record
        if c["personalized"] and c["version"] != CONSENT_VERSION:
            now = self.clock(); old_version = c["version"]
            c.update(personalized=False, at=now)
            c["history"].append({"at": now, "personalized": False, "version": old_version, "reason": "consent_version_changed"})
            u["interests"] = {}
            self._save()
        return u

    # consent (opt-in, never pre-checked, withdrawal as easy as giving)
    def consent(self, uid):
        with self.lock:
            u = self._user(uid); c = u["consent"]
            available = self._publisher_configured(); mock_mode = available and self._mock_mode()
            text = MOCK_CONSENT_TEXT if mock_mode else CONSENT_TEXT if available else UNAVAILABLE_CONSENT_TEXT
            return {"available": available, "personalized": c["personalized"], "version": c["version"], "at": c["at"], "current_version": CONSENT_VERSION,
                    "text": text, "benefits": BENEFITS if mock_mode else None, "credits": u["credits"] if mock_mode else None,
                    "bonus_daily_runs": BENEFITS["bonus_daily_runs"] if mock_mode and c["personalized"] else (0 if mock_mode else None),
                    "interests": sorted(u["interests"]) if c["personalized"] else []}
    def set_consent(self, uid, personalized, version=None, gpc=False):
        if personalized is not True and personalized is not False: raise ValueError("personalized must be true or false")
        if personalized and not self._publisher_configured(): raise ValueError("ads are unavailable: no publisher is configured")
        with self.lock:
            u = self._user(uid); c = u["consent"]; now = self.clock()
            if personalized:
                if version != CONSENT_VERSION: raise ValueError("confirm the current consent text first")
                c.update(personalized=True, version=version, at=now)
                if self._mock_mode() and not u["bonus_granted"]:
                    u["credits"] += BENEFITS["bonus_credits"]; u["bonus_granted"] = True
                    self._ledger({"kind": "bonus_credits", "uid": uid, "credits": BENEFITS["bonus_credits"]})
            else:
                c.update(personalized=False, at=now); u["interests"] = {}     # the profile is deleted on withdrawal
            c["history"].append({"at": now, "personalized": personalized, "version": version if personalized else c["version"],
                                 "text_sha": hashlib.sha256(CONSENT_TEXT.encode()).hexdigest()[:16], "gpc": bool(gpc)})
            self._save(); return self.consent(uid)
    def export(self, uid):
        with self.lock:
            u = self._user(uid)
            return {"consent": u["consent"], "interests": u["interests"], "credits": u["credits"],
                    "ads_shown": [{"at": x["at"], "category": x.get("category")} for x in u["shown"]][-200:],
                    "note": "Free way stores interest categories and ad counts only. No prompts, code or contact details are kept for ads."}
    def erase(self, uid):
        with self.lock:
            u = self._user(uid); keep = u["credits"]
            u.update(interests={}, shown=[], runs={}, anon=secrets.token_hex(8))
            u["consent"].update(personalized=False, at=self.clock())
            u["consent"]["history"].append({"at": self.clock(), "personalized": False, "erased": True})
            u["credits"] = keep; self._save(); return self.consent(uid)

    # ads v2: privacy choice + targeting signals (admin-visible)
    def privacy(self, uid):
        with self.lock:
            u = self._user(uid)
            return {"use_stack": bool(u["consent"]["use_stack"]), "personalized": bool(u["consent"]["personalized"]), "notice": PRIVACY_NOTICE,
                    "enabled": bool(self.state["cfg"].get("enabled", 1)), "available": self._publisher_configured()}
    def set_privacy(self, uid, use_stack):
        if use_stack is not True and use_stack is not False: raise ValueError("use_stack must be true or false")
        with self.lock:
            u = self._user(uid); u["consent"]["use_stack"] = use_stack; u["privacy"]["use_stack"] = use_stack
            u["consent"]["history"].append({"at": self.clock(), "use_stack": use_stack})
            if not use_stack and u.get("signals"): u["signals"] = dict(u["signals"], languages=[], frameworks=[])
            self._save(); return self.privacy(uid)
    def uses_stack(self, uid):
        with self.lock: return bool(self._user(uid)["consent"]["use_stack"])
    def closed(self, uid):
        with self.lock:
            u = self._user(uid); u["closed"] = int(u.get("closed", 0)) + 1; self._save(); return {"ok": True}
    def signals(self):
        with self.lock:
            rows = []
            for uid, u in self.state["users"].items():
                s = u.get("signals") or {}
                rows.append({"user_id": uid, "categories": s.get("categories", []), "languages": s.get("languages", []),
                             "frameworks": s.get("frameworks", []), "at": s.get("at"), "shown": len(u.get("shown", [])),
                             "closed": int(u.get("closed", 0)), "use_stack": bool(u["consent"].get("use_stack", u.get("privacy", {}).get("use_stack", True))),
                             "personalized": bool(u["consent"]["personalized"])})
            return sorted(rows, key=lambda r: -(r["at"] or 0))

    def note_task(self, uid, text):
        """Update the interest profile, only when personalised ads are on. Stores category counts, not text."""
        with self.lock:
            u = self._user(uid)
            if not self._publisher_configured() or not u["consent"]["personalized"]: return
            for c in categories(text, 3): u["interests"][c] = u["interests"].get(c, 0) + 1
            self._save()

    # serving
    def _cap(self, u, run_key):
        cfg = self.state["cfg"]; now = self.clock()
        day = [x for x in u["shown"] if now - x["at"] < 86400]
        if len(day) >= cfg["max_per_day"]: return "daily limit"
        if day and now - day[-1]["at"] < cfg["min_gap_s"]: return "too soon"
        if run_key and u["runs"].get(run_key, 0) >= cfg["max_per_run"]: return "already shown for this run"
        return None
    def next_ad(self, uid, context_text, placement="chat", run_key=None, gpc=False, device=None, agent_state=None, stack=None):
        if placement not in ("chat", "phone", "board"): raise ValueError("placement must be chat, board or phone")
        if not int(self.state["cfg"].get("enabled", 1)): return {"ad": None, "reason": "ads are turned off by the admin"}
        if not self._publisher_configured(): return {"ad": None, "reason": "ad publisher unavailable"}
        if agent_state in RUNNING_STATES: return {"ad": None, "reason": "agent is working"}       # never mid-work
        if agent_state is not None and agent_state not in PAUSE_STATES: return {"ad": None, "reason": "not a pause"}
        thr = float(self.state["cfg"].get("min_relevance", DEFAULT_CFG["min_relevance"]))
        with self.lock:
            if stack and not self._user(uid)["consent"]["use_stack"]: stack = None
        stack = stack or None
        scored = score_categories(context_text, stack, self.state["cfg"].get("stack_weight", DEFAULT_CFG["stack_weight"]))
        cats = [c for c, s in scored if s >= thr][:3]
        with self.lock:
            u = self._user(uid)
            u["signals"] = {"categories": [{"category": c, "score": s} for c, s in scored[:5]], "at": self.clock(),
                            "languages": list((stack or {}).get("languages", []))[:4], "frameworks": list((stack or {}).get("frameworks", []))[:8]}
        if not cats: return {"ad": None, "reason": "nothing relevant"}                         # do not even ask the network
        with self.lock:
            u = self._user(uid); why = self._cap(u, run_key)
            if why: return {"ad": None, "reason": why}
            personalized = u["consent"]["personalized"] and not gpc
            interests = sorted(u["interests"], key=lambda k: -u["interests"][k])[:5] if personalized else []
            self.state["seq"] += 1
            payload = {"placement": placement, "seq": self.state["seq"], "session": hashlib.sha256((u["anon"] + (run_key or "")).encode()).hexdigest()[:24],
                       "anon_id": u["anon"], "context": {"categories": cats, "summary": redact(context_text),
                                                         "stack": {"languages": list((stack or {}).get("languages", []))[:4],
                                                                   "frameworks": list((stack or {}).get("frameworks", []))[:8]}},
                       "interests": interests, "personalized": bool(interests), "device": {k: v for k, v in (device or {}).items() if k in ("ua",)}}
        try: ad = self.adapter.request(payload)
        except AdapterError as e: return {"ad": None, "reason": "network unavailable", "detail": str(e)}
        except Exception as e: return {"ad": None, "reason": "network unavailable", "detail": type(e).__name__}
        if not ad: return {"ad": None, "reason": "no fill"}
        if ad.get("category") not in cats and not (ad.get("category") is None and float(ad.get("relevance", 0)) >= thr):
            return {"ad": None, "reason": "nothing relevant"}                                      # unrelated fill is dropped
        with self.lock:
            imp = secrets.token_hex(10)
            self.state["imps"][imp] = {"uid": uid, "at": self.clock(), "cpm": ad.get("cpm_usd"), "cpc": ad.get("cpc_usd"), "viewed": False, "clicked": False,
                                       "category": ad.get("category"), "personalized": payload["personalized"], "placement": placement, "network": self.adapter.name}
            u["shown"].append({"at": self.clock(), "category": ad.get("category")}); u["shown"] = u["shown"][-500:]
            if run_key: u["runs"][run_key] = u["runs"].get(run_key, 0) + 1
            if len(self.state["imps"]) > 5000:
                for k in sorted(self.state["imps"], key=lambda k: self.state["imps"][k]["at"])[:1000]: del self.state["imps"][k]
            self._save()
        pub = {k: ad[k] for k in ("advertiser", "title", "text", "url") if ad.get(k)}
        stack_note = (" and your project's stack (" + ", ".join(payload["context"]["stack"]["frameworks"][:3] or payload["context"]["stack"]["languages"][:2]) + ")"
                      if stack and (payload["context"]["stack"]["frameworks"] or payload["context"]["stack"]["languages"]) else "")
        pub.update(id=imp, sig=self._sig(imp), label="Sponsored", placement=placement, personalized=payload["personalized"], category=ad.get("category"),
                   why=("Matched to your current task" + stack_note + (": " + ", ".join(c.replace("_", " ") for c in cats) if cats else "") +
                        (". Personalised with your interests (you opted in)." if payload["personalized"] else ". Not personalised.")))
        return {"ad": pub}
    def _sig(self, imp): return hmac.new(self.secret, ("imp:" + imp).encode(), "sha256").hexdigest()[:20]

    def event(self, imp, sig, kind):
        """Record a view (impression became visible) or a click. Idempotent: each counts once per impression."""
        if kind not in ("view", "click"): raise ValueError("kind must be view or click")
        if not isinstance(imp, str) or not isinstance(sig, str) or not hmac.compare_digest(sig, self._sig(imp)): raise PermissionError("bad ad id")
        with self.lock:
            x = self.state["imps"].get(imp)
            if not x: raise KeyError("impression")
            if kind == "click" and not x["viewed"]: self.event(imp, sig, "view")
            flag = "viewed" if kind == "view" else "clicked"
            if x[flag]: return {"ok": True, "duplicate": True}
            x[flag] = True
            price = x["cpm"] / 1000 if kind == "view" and x["cpm"] else (x["cpc"] if kind == "click" and x["cpc"] else 0)
            self._ledger({"kind": "impression" if kind == "view" else "click", "imp": imp, "network": x["network"], "placement": x["placement"], "personalized": x["personalized"]})
            if price: self.revenue(price, source=x["network"], ref=imp)
            self._save(); return {"ok": True}

    # ledger
    def _ledger(self, rec):
        rec = dict(rec, at=self.clock())
        with open(self.ledger_f, "a", encoding="utf-8") as f: f.write(json.dumps(rec) + "\n")
    def entries(self):
        try: return [json.loads(l) for l in self.ledger_f.read_text(encoding="utf-8").splitlines() if l.strip()]
        except OSError: return []
    def balances(self):
        pool = profit = rev = spend = 0; imps = clicks = 0
        for e in self.entries():
            if e["kind"] == "revenue": rev += e["micros"]; pool += e["to_pool"]; profit += e["to_profit"]
            elif e["kind"] == "model_spend": pool -= e["micros"]; spend += e["micros"]
            elif e["kind"] == "impression": imps += 1
            elif e["kind"] == "click": clicks += 1
        return {"pool": pool, "profit": profit, "revenue": rev, "spend": spend, "impressions": imps, "clicks": clicks}
    def revenue(self, amount_usd, source="network", ref=None):
        """Split incoming revenue: fill the model-cost pool up to its target first, then split the surplus."""
        if not self._publisher_configured(): raise RuntimeError("ad publisher unavailable")
        m = micros(amount_usd)
        if m <= 0: raise ValueError("revenue must be positive")
        with self.lock:
            cfg = self.state["cfg"]; b = self.balances()
            need = max(0, micros(cfg["pool_target_usd"]) - b["pool"])
            first = min(m, need); surplus = m - first
            extra = int(surplus * cfg["surplus_pool_share"])
            to_pool = first + extra; to_profit = m - to_pool
            self._ledger({"kind": "revenue", "micros": m, "to_pool": to_pool, "to_profit": to_profit, "source": source, "ref": ref})
            return {"to_pool": usd(to_pool), "to_profit": usd(to_profit)}
    def spend_model(self, amount_usd, note=""):
        """Pay for model usage (paid fallback, hosted capacity) from the pool. Never from profit."""
        if not self._publisher_configured(): raise RuntimeError("ad publisher unavailable")
        m = micros(amount_usd)
        if m <= 0: raise ValueError("spend must be positive")
        with self.lock:
            if self.balances()["pool"] < m: raise RuntimeError("model-cost pool is too low for this spend")
            self._ledger({"kind": "model_spend", "micros": m, "note": str(note)[:120]}); return self.dashboard()
    def set_config(self, **kw):
        with self.lock:
            cfg = self.state["cfg"]
            for k, v in kw.items():
                if k not in DEFAULT_CFG: raise ValueError(f"unknown setting {k}")
                if isinstance(v, bool) or not isinstance(v, (int, float)): raise ValueError(f"{k} must be a number")
                if k in ("surplus_pool_share", "min_relevance", "stack_weight") and not 0 <= v <= 1: raise ValueError(f"{k} must be between 0 and 1")
                if k == "enabled" and v not in (0, 1): raise ValueError("enabled must be 0 or 1")
                if k == "surplus_pool_share" and not 0 <= v <= 1: raise ValueError("surplus_pool_share must be between 0 and 1")
                if v < 0: raise ValueError(f"{k} must not be negative")
                cfg[k] = int(v) if k in INT_CFG else float(v)
            self._save(); return dict(cfg)
    def dashboard(self):
        with self.lock:
            if not self._publisher_configured():
                return {"available": False, "reason": "No ad publisher is configured.", "revenue_usd": None,
                        "pool_usd": None, "profit_usd": None, "model_spend_usd": None, "pool_target_usd": None,
                        "impressions": None, "clicks": None, "ctr": None, "ecpm_usd": None,
                        "opted_in_users": None, "users": None, "network": None, "network_configured": False,
                        "config": dict(self.state["cfg"]), "days": []}
            b = self.balances(); cfg = dict(self.state["cfg"]); days = {}
            for e in self.entries():
                d = time.strftime("%Y-%m-%d", time.localtime(e["at"])); r = days.setdefault(d, {"day": d, "revenue": 0, "impressions": 0, "clicks": 0, "spend": 0})
                if e["kind"] == "revenue": r["revenue"] += e["micros"]
                elif e["kind"] == "impression": r["impressions"] += 1
                elif e["kind"] == "click": r["clicks"] += 1
                elif e["kind"] == "model_spend": r["spend"] += e["micros"]
            rows = [dict(r, revenue=usd(r["revenue"]), spend=usd(r["spend"])) for r in sorted(days.values(), key=lambda r: r["day"], reverse=True)][:30]
            opted = sum(1 for u in self.state["users"].values() if u["consent"]["personalized"])
            return {"revenue_usd": usd(b["revenue"]), "pool_usd": usd(b["pool"]), "profit_usd": usd(b["profit"]), "model_spend_usd": usd(b["spend"]),
                    "pool_target_usd": cfg["pool_target_usd"], "impressions": b["impressions"], "clicks": b["clicks"],
                    "ctr": round(b["clicks"] / b["impressions"], 4) if b["impressions"] else 0,
                    "ecpm_usd": round(usd(b["revenue"]) / b["impressions"] * 1000, 4) if b["impressions"] else 0,
                    "opted_in_users": opted, "users": len(self.state["users"]), "network": self.adapter.name,
                    "network_configured": self.adapter.configured(), "config": cfg, "days": rows}
