"""Providers: deterministic mock + OpenAI-compatible free providers (BYOK). Router with failover."""
import json, os, re, time, urllib.request, urllib.error
from . import catalog

ENDPOINTS = {
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "nim": "https://integrate.api.nvidia.com/v1/chat/completions",
    # extra free BYOK providers (free tiers checked 2026-10-21; see README)
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "github": "https://models.github.ai/inference/chat/completions",
    "mistral": "https://api.mistral.ai/v1/chat/completions",
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",   # key = "<account id>:<api token>"
}
EXTRA_PROVIDERS = ("groq", "github", "mistral", "cloudflare")
MODEL_LISTS = {"openrouter": "https://openrouter.ai/api/v1/models", "nim": "https://integrate.api.nvidia.com/v1/models",
               "groq": "https://api.groq.com/openai/v1/models", "github": "https://models.github.ai/catalog/models",
               "mistral": "https://api.mistral.ai/v1/models", "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account}/ai/models/search"}

def split_key(provider, key):
    """Cloudflare keys carry the account id: '<account id>:<token>'. Returns (url, bearer)."""
    url = ENDPOINTS[provider]
    if provider == "cloudflare":
        if not key or ":" not in key: raise ProviderError("Cloudflare key must be '<account id>:<api token>'", 401)
        acct, key = key.split(":", 1)
        if not re.fullmatch(r"[0-9a-f]{32}", acct): raise ProviderError("Cloudflare account id must be 32 hex characters", 401)
        url = url.format(account=acct)
    return url, key

class ProviderError(Exception):
    retry_after = None; daily = False; reset = None
    def __init__(self, msg, status=0, retryable=True):
        super().__init__(msg); self.status = status; self.retryable = retryable

SYSTEM = """You are Free way, the coding agent built into Free way. Reply with ONE JSON object and nothing else (no markdown fences):
{"summary": str, "steps": [str], "actions": [{"type":"write_file","path":str,"content":str} | {"type":"run_command","command":str}]}
Rules:
- Static web projects: plain HTML/CSS/JS, no build step, no npm install, no CDNs. Entry page is index.html.
- At most 6 files, each under 120 lines. Keep the code compact but complete and working.
- Paths are relative, no "..". Commands: only node <file>.js, python <file>.py, ls, cat. No shell operators.
- If there is logic, add a tiny test file run with node (plain asserts, no frameworks) and run it as the last action.
- Premium, clean UI; no emojis. Wrap localStorage access in try/catch."""

def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:40] or "project"

class MockProvider:
    """Deterministic offline-free test double. Same prompt -> same plan and files."""
    name = "mock"
    def __init__(self, fail_times=0, bad_outputs=None):
        self.fail_times = fail_times; self.calls = 0; self.bad = list(bad_outputs or [])
    def complete(self, model, messages, key=None, timeout=60, on_delta=None, **kw):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise ProviderError("mock 429", 429)
        def deliver(reply):
            if on_delta: on_delta(reply)
            return reply
        if self.bad: return deliver(self.bad.pop(0)) # scripted malformed replies (tests / fuzzing)
        d = float(os.environ.get("FC_MOCK_PLAN_DELAY", "0") or 0)
        if d: time.sleep(d)
        users = [m["content"] for m in messages if m["role"] == "user"]
        prompt = users[0] if users else ""
        sysm = [m["content"] for m in messages if m["role"] == "system" and isinstance(m["content"], str)]
        if sysm and sysm[0].startswith("You are Free way Chat"): return deliver("Demo reply: " + (users[-1] if isinstance(users[-1], str) else "")[:120])
        if sysm and sysm[0].startswith("You are Free way Research"): return deliver("Demo answer based on the sources [1], with more detail in [2].")
        if sysm and sysm[0].startswith("You are Free way specialist:"):
            role = sysm[0].split(":", 1)[1].split(".", 1)[0].strip()
            try: data = json.loads(prompt) if isinstance(prompt, str) else {}
            except ValueError: data = {}
            if role == "discover":
                result = {"summary": "Inspected the bounded project context.", "findings": ["The project workspace is isolated."]}
            elif role == "plan":
                result = {"summary": "Prepared a bounded implementation plan.", "steps": ["Create the requested project artifact.", "Review each proposed action before execution."]}
            elif role == "implement":
                result = mock_plan(str(data.get("task") or "Build a small project page"))
            elif role == "verify":
                result = {"status": "passed", "findings": []}
            else:
                result = {}
            return deliver(json.dumps(result))
        if sysm and sysm[0].startswith("You are Free way agent:"):
            role = sysm[0].split(":", 1)[1].split(".", 1)[0].strip()
            try: data = json.loads(prompt) if isinstance(prompt, str) else {}
            except ValueError: data = {}
            if role == "thinker":
                result = {"summary": "Analysed the task with the picked files and search hits.", "approach": ["Change the picked files.", "Keep the change small and reviewable."], "risks": []}
            elif role == "planner":
                result = {"summary": "Plan only; no files were changed.", "steps": ["Review the picked files.", "Apply the change in a build mode after approval."]}
            elif role == "reviewer":
                result = {"status": "passed", "findings": []}
            else:
                result = mock_plan(str(data.get("task") or "Build a small project page"))
            return deliver(json.dumps(result))
        if sysm and sysm[0].startswith("HELPER "):
            from .helpers import mock_reply
            return deliver(json.dumps(mock_reply(sysm[0].split("\n", 1)[0][7:], prompt if isinstance(prompt, str) else "")))
        if any(u.startswith("FIX REQUEST") for u in users): return deliver(json.dumps(mock_fix(prompt)))
        if any(isinstance(u, str) and "This is a server-side Mission." in u for u in users):
            plan = mock_plan(prompt)
            plan["actions"] = [action for action in plan["actions"] if action.get("type") == "write_file"][:1]
            plan["steps"] = plan["steps"][:1] or ["Create the initial artifact"]
            plan["summary"] = "Initial milestone: " + plan["summary"]
            plan["milestones"] = ["Create the initial application shell", "Implement the core interaction", "Verify and finish the application"]
            return deliver(json.dumps(plan))
        return deliver(json.dumps(mock_plan(prompt)))

CSS = """:root{--bg:#0a0c10;--surface:#10131a;--line:#232838;--text:#e8eaf0;--muted:#8b93a7;--accent:#7c8cff}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:720px;margin:0 auto;padding:24px}h1{font-size:32px;letter-spacing:-.02em;margin:0 0 8px}
p{color:var(--muted);line-height:1.6}.btn{display:inline-block;background:var(--accent);color:#07080b;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:600}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}
input:not([type=checkbox]){width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:#0c0e14;color:var(--text);font-size:16px}
li{display:flex;gap:12px;align-items:center;justify-content:flex-start;text-align:left;padding:10px 0;border-bottom:1px solid var(--line)}li.done span{text-decoration:line-through;color:var(--muted)}
input[type=checkbox]{width:18px;height:18px;flex:none;margin:0;accent-color:var(--accent,#8b93ff)}li span{flex:1}
ul{list-style:none;padding:0}button{min-height:44px}"""

BUGGY = "exports.add=(a,b)=>a-b\n"
FIXED = "exports.add=(a,b)=>a+b\n"
MATH_TEST = "const {add}=require('./math.js');if(add(2,3)!==5){console.error('FAIL add(2,3) expected 5 got '+add(2,3));process.exit(1)}console.log('math tests: 1 passed')\n"

def mock_fix(prompt):
    fixed = FIXED if "unfixable" not in prompt.lower() else BUGGY
    return {"summary": "Fix add()", "steps": ["Correct add in math.js", "Re-run the test"],
            "actions": [{"type": "write_file", "path": "math.js", "content": fixed}, {"type": "run_command", "command": "node math.test.js"}]}

def mock_plan(prompt):
    p = prompt.lower()
    if "buggy" in p or "unfixable" in p:   # deterministic failing check, used to test the auto-fix loop
        return {"summary": "Math helper with a test", "steps": ["Write math.js", "Write the test", "Run it"],
                "actions": [{"type": "write_file", "path": "math.js", "content": BUGGY}, {"type": "write_file", "path": "math.test.js", "content": MATH_TEST},
                            {"type": "write_file", "path": "index.html", "content": "<!doctype html><title>Math</title><h1>Math</h1>"},
                            {"type": "run_command", "command": "node math.test.js"}]}
    if "slow" in p:   # deterministic long run, used to test disconnects and server restarts mid-run
        slow = "const t=Date.now();while(Date.now()-t<2500){}require('fs').appendFileSync('runs.log','run\\n');console.log('slow step ok')"
        acts = [{"type": "write_file", "path": "slow.js", "content": slow}]
        for k in range(1, 4):
            acts += [{"type": "write_file", "path": f"part{k}.txt", "content": f"part {k}\n"}, {"type": "run_command", "command": "node slow.js"}]
        acts.append({"type": "write_file", "path": "index.html", "content": "<!doctype html><title>Slow</title><h1>Slow task done</h1>"})
        return {"summary": "Slow multi-step task", "steps": ["Write helper", "Run three slow steps", "Finish"], "actions": acts}
    if "todo" in p:
        landing = "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Tidy - todo app</title><link rel=stylesheet href=style.css></head><body><main class=wrap><h1>Tidy</h1><p>A calm todo list that works on your phone.</p><a class=btn id=start href=app.html>Open the app</a><div class=card><b>Fast</b><p>Add a task in one tap.</p></div><div class=card><b>Private</b><p>Saved on your device.</p></div></main></body></html>"
        app = "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Tidy app</title><link rel=stylesheet href=style.css></head><body><main class=wrap><h1>Today</h1><form id=f><input id=t placeholder='Add a task' aria-label='New task'></form><ul id=list></ul><p id=count></p></main><script src=todo.js></script><script src=app.js></script></body></html>"
        todo = "(function(g){function add(l,t){t=String(t||'').trim();if(!t)return l;return l.concat([{text:t,done:false}])}function toggle(l,i){return l.map(function(x,j){return j===i?{text:x.text,done:!x.done}:x})}function remaining(l){return l.filter(function(x){return!x.done}).length}var api={add:add,toggle:toggle,remaining:remaining};if(typeof module!=='undefined')module.exports=api;else g.Todo=api})(this);"
        appjs = "var store={get:function(){try{return localStorage.getItem('tidy')}catch(e){return store.mem}},set:function(v){try{localStorage.setItem('tidy',v)}catch(e){store.mem=v}},mem:null};var items=JSON.parse(store.get()||'[]');function render(){var ul=document.getElementById('list');ul.innerHTML='';items.forEach(function(x,i){var li=document.createElement('li');if(x.done)li.className='done';var b=document.createElement('input');b.type='checkbox';b.checked=x.done;b.onchange=function(){items=Todo.toggle(items,i);save()};var s=document.createElement('span');s.textContent=x.text;li.appendChild(b);li.appendChild(s);ul.appendChild(li)});document.getElementById('count').textContent=Todo.remaining(items)+' left'}function save(){store.set(JSON.stringify(items));render()}document.getElementById('f').onsubmit=function(e){e.preventDefault();var t=document.getElementById('t');items=Todo.add(items,t.value);t.value='';save()};render();"
        test = "const T=require('./todo.js');const assert=require('assert');let l=T.add([],'milk');l=T.add(l,'  ');assert.strictEqual(l.length,1);l=T.toggle(l,0);assert.strictEqual(T.remaining(l),0);console.log('todo tests: 3 passed');"
        return {"summary": "Build a todo app with a landing page",
                "steps": ["Create the landing page (index.html)", "Create the todo app screen (app.html)",
                          "Write todo logic with tests (todo.js, todo.test.js)", "Add shared premium styles (style.css)",
                          "Run the tests"],
                "actions": [{"type": "write_file", "path": "index.html", "content": landing},
                            {"type": "write_file", "path": "app.html", "content": app},
                            {"type": "write_file", "path": "todo.js", "content": todo},
                            {"type": "write_file", "path": "app.js", "content": appjs},
                            {"type": "write_file", "path": "todo.test.js", "content": test},
                            {"type": "write_file", "path": "style.css", "content": CSS},
                            {"type": "run_command", "command": "node todo.test.js"}]}
    title = prompt.strip().split("\n")[0][:60] or "New page"
    safe = title.replace("<", "").replace(">", "").replace("&", "and")
    page = f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{safe}</title><link rel=stylesheet href=style.css></head><body><main class=wrap><h1>{safe}</h1><p>Built by Free way.</p><a class=btn href='#'>Get started</a></main></body></html>"
    return {"summary": f"Build: {safe}", "steps": ["Create index.html", "Add premium styles", "List files"],
            "actions": [{"type": "write_file", "path": "index.html", "content": page},
                        {"type": "write_file", "path": "style.css", "content": CSS},
                        {"type": "run_command", "command": "ls"}]}

def request_opts(provider, model):
    """Per-upstream knobs measured live (2026-10-21): turning off hidden reasoning cuts latency 10-20x and
    stops empty replies (finish=length). Rejected options are dropped automatically (see complete)."""
    m = model.lower()
    if provider == "openrouter":
        if "minimax" in m: return {"reasoning": {"effort": "low"}}       # reasoning is mandatory there
        return {"reasoning": {"enabled": False}}
    if provider == "nim":
        if "nemotron" in m: return {"chat_template_kwargs": {"enable_thinking": False}}
        if "deepseek" in m: return {"chat_template_kwargs": {"thinking": False}}
    return {}

class OpenAICompatProvider:
    def __init__(self, name, url=None, opener=None):
        self.name = name; self.url = url; self._custom_opener = opener is not None
        self.opener = opener or urllib.request.urlopen
    def complete(self, model, messages, key=None, timeout=90, deadline=360, max_tokens=12000, on_delta=None, strict_free=False, on_usage=None):
        """Streams the reply (SSE). `timeout` applies per chunk, `deadline` to the whole reply.
        JSON mode is not requested: some free endpoints return empty content with it; parse_plan copes with prose."""
        if not key:
            raise ProviderError(f"no {self.name} key (BYOK)", 401, retryable=True)
        if strict_free:
            if self.name != "openrouter" or not model.endswith(":free") or (self.url and self.url != ENDPOINTS["openrouter"]):
                raise ProviderError("Strict free route unavailable", 503, False)
            url, key = split_key("openrouter", key)
            self._url = url
            return self._stream(model, messages, key, min(timeout, 30), min(deadline, 60), min(max_tokens, 2048), {}, on_delta, strict_free=True, on_usage=on_usage)
        url, key = split_key(self.name, key) if self.name in ENDPOINTS else (self.url, key)
        if self.url: url = self.url                       # explicit endpoint (tests, self-hosted)
        self._url = url
        opts = request_opts(self.name, model)
        emitted = False
        def delta(text):
            nonlocal emitted
            emitted = True
            if on_delta: on_delta(text)
        callback = delta if on_delta else None
        try: return self._stream(model, messages, key, timeout, deadline, max_tokens, opts, callback, on_usage=on_usage)
        except ProviderError as e:
            if not emitted and e.status == 400 and opts:                 # endpoint rejected an option: retry plain
                return self._stream(model, messages, key, timeout, deadline, max_tokens, {}, callback, on_usage=on_usage)
            if not emitted and e.status == 429 and not e.daily and not getattr(self, "no_backoff", False):
                time.sleep(min(e.retry_after or 2, 5))   # one short backoff, then the router fails over
                return self._stream(model, messages, key, timeout, deadline, max_tokens, opts, callback, on_usage=on_usage)
            raise

    def _stream(self, model, messages, key, timeout, deadline, max_tokens, opts, on_delta=None, strict_free=False, on_usage=None):
        body = dict({"model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens, "stream": True}, **opts)
        if strict_free:
            body["provider"] = {"data_collection": "deny", "zdr": True,
                                "max_price": {"prompt": 0, "completion": 0, "request": 0, "image": 0}}
        body = json.dumps(body).encode()
        req = urllib.request.Request(getattr(self, "_url", None) or self.url, body, {"Authorization": f"Bearer {key}", "Accept": "text/event-stream",
                                     "Content-Type": "application/json", "X-Title": "Free way"})
        t0 = time.time(); parts = []; finish = None
        usage_reported = False

        def report_usage(data):
            nonlocal usage_reported
            if usage_reported or on_usage is None or not isinstance(data, dict): return
            usage = data.get("usage")
            if not isinstance(usage, dict): return
            input_tokens = usage.get("prompt_tokens")
            if input_tokens is None: input_tokens = usage.get("input_tokens")
            output_tokens = usage.get("completion_tokens")
            if output_tokens is None: output_tokens = usage.get("output_tokens")
            upstream_time = data.get("created")
            if upstream_time is None: upstream_time = data.get("timestamp")
            event = {"input_tokens": input_tokens, "output_tokens": output_tokens,
                     "total_tokens": usage.get("total_tokens"), "route": data.get("route"),
                     "model": data.get("model"), "time": upstream_time}
            try:
                if on_usage(event) is not False: usage_reported = True
            except Exception:
                pass

        try:
            opener = self.opener
            if strict_free and not self._custom_opener:
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, req, fp, code, msg, headers, newurl): return None
                opener = urllib.request.build_opener(NoRedirect()).open
            with opener(req, timeout=timeout) as r:
                ctype = (r.headers.get("Content-Type") or "") if hasattr(r, "headers") and r.headers else ""
                if "event-stream" not in ctype:   # non-streaming server or test double
                    data = json.loads(r.read().decode())
                    if isinstance(data, dict) and data.get("error"): raise ProviderError(f"{self.name} error: {str(data['error'])[:160]}", 502)
                    try: c = data["choices"][0]["message"].get("content")
                    except (KeyError, IndexError, TypeError, AttributeError): raise ProviderError(f"{self.name} bad response", 502)
                    if not c: raise ProviderError(f"{self.name} empty reply", 502)
                    report_usage(data)
                    return c
                for raw in r:
                    if time.time() - t0 > deadline: raise ProviderError(f"{self.name} reply exceeded {deadline}s", 504)
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"): continue
                    chunk = line[5:].strip()
                    if chunk == "[DONE]": break
                    try: d = json.loads(chunk)
                    except ValueError: continue
                    if d.get("error"):
                        code = (d["error"].get("code") if isinstance(d["error"], dict) else 0) or 502
                        raise ProviderError(f"{self.name} stream error {code}", int(code) if str(code).isdigit() else 502)
                    report_usage(d)
                    for ch in d.get("choices") or []:
                        c = (ch.get("delta") or {}).get("content")
                        if c:
                            parts.append(c)
                            if on_delta: on_delta(c)
                        finish = ch.get("finish_reason") or finish
        except urllib.error.HTTPError as e:
            err = ProviderError(f"{self.name} HTTP {e.code}", e.code, retryable=e.code in (408, 429, 500, 502, 503, 504, 401, 403, 404))
            if e.code == 429 and not strict_free:
                try: body = e.read().decode("utf-8", "replace")[:2000]
                except Exception: body = ""
                if "per-day" in body or "per_day" in body or "daily" in body.lower():
                    err.daily = True; m = re.search(r'"X-RateLimit-Reset"\s*:\s*"?(\d+)', body)
                    err.reset = int(m.group(1)) / 1000 if m and len(m.group(1)) > 10 else (int(m.group(1)) if m else time.time() + 3600)
                    err.args = (f"{self.name} daily free quota used up",)
            try: err.retry_after = float(e.headers.get("Retry-After")) if e.headers and e.headers.get("Retry-After") else None
            except ValueError: err.retry_after = None
            raise err
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise ProviderError(f"{self.name} network: {e}", 0)
        out = "".join(parts)
        if not out: raise ProviderError(f"{self.name} empty reply (finish={finish})", 502)
        return out

def parse_plan(text):
    """Extract the JSON plan from a model reply (tolerates code fences / prose)."""
    if not isinstance(text, str):
        raise ValueError("no text")
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m: t = m.group(1)
    if not t.startswith("{"):
        i, j = t.find("{"), t.rfind("}")
        if i < 0 or j <= i: raise ValueError("no JSON object")
        t = t[i:j + 1]
    d, _ = json.JSONDecoder().raw_decode(t)   # tolerate trailing prose after the object
    if not isinstance(d, dict): raise ValueError("plan must be an object")
    steps = d.get("steps") or []
    actions = d.get("actions") or []
    if not isinstance(steps, list) or not isinstance(actions, list):
        raise ValueError("steps/actions must be lists")
    clean = []
    for a in actions:
        if not isinstance(a, dict): continue
        if a.get("type") == "write_file" and isinstance(a.get("path"), str) and isinstance(a.get("content"), str):
            clean.append({"type": "write_file", "path": a["path"], "content": a["content"]})
        elif a.get("type") == "run_command" and isinstance(a.get("command"), str):
            clean.append({"type": "run_command", "command": a["command"]})
    return {"summary": str(d.get("summary", ""))[:300], "steps": [str(s)[:300] for s in steps][:20], "actions": clean[:40]}

USER_BUSY = "Free models are busy right now (rate limited). Wait a minute, or pick another model in the model picker."
USER_NOKEY = "No free model key yet. Add a free NVIDIA NIM or OpenRouter key in Settings; it takes a minute and costs nothing."
USER_DOWN = "The free models are not answering right now. Free way tried every free model it can reach; please try again in a minute."

class Router:
    """Routes a brand request across candidates with failover. Mock mode uses the mock provider."""
    def __init__(self, keys=None, providers=None, mock=None, attempt_budget=None, on_usage=None):
        self.keys = keys if keys is not None else {}
        self.providers = providers or {n: OpenAICompatProvider(n) for n in ENDPOINTS}
        self.mock = mock
        self.attempt_budget = attempt_budget
        self.log = []; self.cooldown = {}   # provider -> unix time when its daily free quota resets
        self.on_usage = on_usage

    def _record_usage(self, event):
        if self.on_usage is None: return False
        try: return self.on_usage(event)
        except Exception: return False

    def _complete_strict(self, brand_id, messages, skill, on_delta, state, max_attempts=None):
        bid, prov, model = catalog.resolve(brand_id, skill)[0]
        key = self.keys.get("openrouter")
        if not key:
            raise ProviderError("No OpenRouter key configured for this optional free model", 503, False)
        if getattr(self, "attempt_budget", None) is None:
            raise ProviderError("Strict OpenRouter free route unavailable", 503, False)
        p = self.providers.get("openrouter")
        if p is None:
            raise ProviderError("Strict free route unavailable", 503, False)
        emitted = False
        def delta(text):
            nonlocal emitted
            emitted = True
            if on_delta: on_delta(text)
        limit = min(2, max_attempts if max_attempts is not None else 2)
        while state["attempts"] < limit:
            if self.attempt_budget is not None:
                self.attempt_budget.reserve()
            state["attempts"] += 1
            try:
                out = p.complete(model, messages, key=key, timeout=30, deadline=60,
                                 max_tokens=2048, on_delta=delta,
                                 on_usage=self._record_usage if self.on_usage is not None else None,
                                 strict_free=True)
                route = {"brand": bid, "provider": "openrouter", "model": model,
                         "switched": 0, "attempts": state["attempts"]}
                self.log.append(dict(route, ok=True))
                return out, route
            except ProviderError as e:
                self.log.append({"brand": bid, "provider": "openrouter", "model": model,
                                 "ok": False, "status": int(getattr(e, "status", 0) or 0)})
                if emitted or not e.retryable or state["attempts"] >= limit:
                    raise ProviderError("Strict OpenRouter free route unavailable; no fallback was attempted", 503, False) from None
            except Exception:
                self.log.append({"brand": bid, "provider": "openrouter", "model": model, "ok": False, "status": 0})
                raise ProviderError("Strict OpenRouter free route unavailable; no fallback was attempted", 503, False) from None
        raise ProviderError("Strict OpenRouter free route exhausted its attempt limit", 503, False)

    def complete(self, brand_id, messages, skill="code", fast=False, on_delta=None):
        """fast=True (chat): short per-model timeouts, rate-limited providers skipped, last working model tried first."""
        cands = catalog.resolve(brand_id, skill)
        if self.mock is None and getattr(catalog.ALL.get(brand_id), "strict_openrouter_free", False):
            return self._complete_strict(brand_id, messages, skill, on_delta, {"attempts": 0})
        if fast and getattr(self, "last_ok", None) in cands[1:] and brand_id == "auto":
            cands = [self.last_ok] + [c for c in cands if c != self.last_ok]
        if self.mock is not None:
            out = self.mock.complete("mock", messages, on_delta=on_delta) if on_delta else self.mock.complete("mock", messages)
            self.log.append({"brand": brand_id, "provider": "mock", "model": "mock", "ok": True})
            return out, {"brand": brand_id, "provider": "mock", "model": "mock", "switched": 0}
        errors = []
        for n, (bid, prov, model) in enumerate(cands):
            p = self.providers.get(prov)
            if p is None or not self.keys.get(prov): continue        # no key for this provider: try the next one, never stop here
            if fast and self.cooldown.get(prov, 0) > time.time(): continue
            t0 = time.time()
            emitted = False
            def delta(text):
                nonlocal emitted
                emitted = True
                if on_delta: on_delta(text)
            try:
                kw = {"timeout": 12, "deadline": 40, "max_tokens": 1200} if fast and isinstance(p, OpenAICompatProvider) else {}
                if on_delta: kw["on_delta"] = delta
                if self.on_usage is not None and isinstance(p, OpenAICompatProvider): kw["on_usage"] = self._record_usage
                out = p.complete(model, messages, key=self.keys.get(prov), **kw)
                if fast: self.last_ok = (bid, prov, model)
                self.log.append({"brand": bid, "provider": prov, "model": model, "ok": True, "ms": int((time.time()-t0)*1000)})
                return out, {"brand": bid, "provider": prov, "model": model, "switched": n}
            except ProviderError as e:
                self.log.append({"brand": bid, "provider": prov, "model": model, "ok": False, "error": str(e)})
                if emitted: raise
                errors.append(str(e))                    # any failure: fall through to the next model
                if fast and getattr(e, "status", 0) == 429: self.cooldown[prov] = time.time() + 60
        uniq = list(dict.fromkeys(errors))
        if not any(self.keys.get(p) for p in self.providers) or (uniq and all("key (BYOK)" in e for e in uniq)) or not uniq:
            raise ProviderError(USER_NOKEY, 503, False)
        raise ProviderError(USER_DOWN, 503, False)

    MODEL_BUDGET = 300   # seconds per model (all repair rounds) before falling back

    def complete_typed(self, brand_id, messages, schema=None, skill="plan", retries=2, max_provider_attempts=None):
        """Typed call: validate every reply against `schema`; on invalid output send the validation
        errors back (up to `retries` repairs per model), then fall back to the next free model.
        max_provider_attempts caps actual upstream calls across repairs and model failover.
        Returns (validated_object, route). Raises ProviderError with a user-facing message."""
        from .schema import BuildPlan, SchemaError, validate
        schema = schema or BuildPlan
        if max_provider_attempts is not None and (type(max_provider_attempts) is not int or not 1 <= max_provider_attempts <= 64):
            raise ValueError("max_provider_attempts must be an integer between 1 and 64")
        cands = catalog.resolve(brand_id, skill)          # raises PermissionError for premium brands
        if self.mock is None and getattr(catalog.ALL.get(brand_id), "strict_openrouter_free", False):
            limit = min(2, max_provider_attempts if max_provider_attempts is not None else 2)
            state = {"attempts": 0}; msgs = list(messages)
            for repair in range(min(max(0, retries) + 1, limit)):
                out, route = self._complete_strict(brand_id, msgs, skill, None, state, max_attempts=limit)
                try:
                    obj = validate(out, schema)
                except SchemaError as e:
                    if state["attempts"] >= limit:
                        raise ProviderError("Strict OpenRouter free route returned an invalid typed response", 502, False) from None
                    msgs = msgs + [{"role": "assistant", "content": str(out or "")[:8000]}, {"role": "user", "content": e.feedback}]
                    continue
                route.update({"repairs": repair, "attempts": state["attempts"]})
                self.log[-1].update(route)
                return obj, route
            raise ProviderError("Strict OpenRouter free route exhausted its attempt limit", 503, False)
        if self.mock is not None: cands = [(brand_id, "mock", "mock")]
        attempts = []; tried = 0; provider_attempts = 0
        for n, (bid, prov, model) in enumerate(cands):
            if max_provider_attempts is not None and provider_attempts >= max_provider_attempts: break
            p = self.mock if prov == "mock" else self.providers.get(prov)
            if p is None or (prov != "mock" and not self.keys.get(prov)): continue   # providers without a key are skipped, not errors
            if self.cooldown.get(prov, 0) > time.time():
                attempts.append({"brand": bid, "provider": prov, "model": model, "kind": "provider", "status": 429, "error": f"{prov} daily free quota used up", "skipped": True}); continue
            tried += 1; msgs = list(messages); start = time.time()
            for k in range(retries + 1):
                if max_provider_attempts is not None and provider_attempts >= max_provider_attempts: break
                t0 = time.time(); left = self.MODEL_BUDGET - (t0 - start)
                if left < 20:
                    attempts.append({"brand": bid, "provider": prov, "model": model, "kind": "provider", "status": 504, "error": f"{prov} over the {self.MODEL_BUDGET}s budget"}); break
                provider_attempts += 1
                try:
                    out = p.complete(model, msgs, key=self.keys.get(prov)) if prov == "mock" else p.complete(model, msgs, key=self.keys.get(prov), deadline=min(240, left))
                except ProviderError as e:
                    if e.daily: self.cooldown[prov] = e.reset or time.time() + 3600   # skip this provider until reset
                    attempts.append({"brand": bid, "provider": prov, "model": model, "kind": "provider", "status": e.status, "error": str(e)})
                    self.log.append(dict(attempts[-1], ok=False))
                    break                                   # provider problem: next model
                ms = int((time.time() - t0) * 1000)
                try:
                    obj = validate(out, schema)
                except SchemaError as e:
                    attempts.append({"brand": bid, "provider": prov, "model": model, "kind": "schema", "error": str(e), "ms": ms})
                    self.log.append(dict(attempts[-1], ok=False))
                    msgs = msgs + [{"role": "assistant", "content": (out or "")[:8000]}, {"role": "user", "content": e.feedback}]
                    continue                                # repair with the same model
                route = {"brand": bid, "provider": prov, "model": model, "switched": n, "repairs": k, "attempts": len(attempts) + 1, "ms": ms}
                self.log.append(dict(route, ok=True))
                return obj, route
        prov_err = [a for a in attempts if a["kind"] == "provider"]; sch = [a for a in attempts if a["kind"] == "schema"]
        if attempts and all("key (BYOK)" in a["error"] for a in attempts): raise ProviderError(USER_NOKEY, 503, False)
        if prov_err and not sch and all(a.get("skipped") or "daily" in a["error"] for a in prov_err if "key (BYOK)" not in a["error"]) and any("daily" in a["error"] for a in prov_err):
            when = min(self.cooldown.values()) if self.cooldown else None
            raise ProviderError("Today's free model quota is used up on your connected providers" + (f" (resets {time.strftime('%H:%M', time.localtime(when))})" if when else "") +
                                ". Add the other free provider key in Settings to keep going.", 429, False)
        if prov_err and not sch and all(a["status"] == 429 for a in prov_err if "key (BYOK)" not in a["error"]) and any(a["status"] == 429 for a in prov_err):
            raise ProviderError(USER_BUSY, 429, False)
        if sch:
            raise ProviderError(f"No free model returned a valid plan ({len(attempts)} attempts across {tried} models). "
                                f"Last problem: {sch[-1]['error']}. Try rephrasing the task or pick another model.", 502, False)
        if not tried: raise ProviderError(USER_NOKEY, 503, False)
        raise ProviderError(USER_DOWN, 503, False)
