"""Built-in MCP tools for Free way's free models (Model Context Protocol client: stdio and Streamable HTTP).

Free way starts the curated servers itself and, for each planning step, picks at most MAX_TOOLS relevant
READ-ONLY tools, lets the model choose at most MAX_CALLS of them through the typed schema layer, runs them,
and adds the (untrusted, truncated) results to the planning context. Writes and commands never go through
MCP: they stay plan actions that the user approves. Sources and licences: THIRD_PARTY_NOTICES.md."""
import json, os, queue, re, shutil, subprocess, threading, time, urllib.request
from typing import Annotated, ClassVar, Dict, List
from pydantic import Field, model_validator
from .schema import Strict

PROTOCOL = "2025-06-18"
MAX_TOOLS = 4          # tools offered to the model per step (small free models get confused by long lists)
PER_SERVER = 2         # tools per server per step
MAX_CALLS = 2          # tool calls per step
MAX_RESULT = 4000      # characters kept per tool result
READONLY = re.compile(r"(^|[_-])(read|search|find|grep|glob|list|get|open|query|resolve|status|log|diff|show|fetch|think|lookup|outline|symbols?)([_-]|$)", re.I)
WRITEY = re.compile(r"(write|edit|patch|create|delete|remove|move|rename|exec|run|shell|command|session|commit|push|reset|checkout|add_|kill|install)", re.I)

# Curated servers (permissive licences only). Started on demand with the launcher they need; skipped when it is missing.
CURATED = [
    {"id": "memory", "name": "Memory", "repo": "https://github.com/modelcontextprotocol/servers/tree/main/src/memory", "license": "MIT (relicensing to Apache-2.0)",
     "transport": "stdio", "command": ["npx", "-y", "@modelcontextprotocol/server-memory@2.0.0"], "env": {"MEMORY_FILE_PATH": "{data}/mcp-memory.jsonl"},
     "tools": ["search_nodes", "open_nodes"], "keywords": "remember previous earlier last before again project history"},
    {"id": "context7", "name": "Live docs (Context7)", "repo": "https://github.com/upstash/context7", "license": "MIT",
     "transport": "http", "url": "https://mcp.context7.com/mcp", "tools": ["resolve-library-id", "query-docs", "get-library-docs"],
     "keywords": "library framework api docs documentation react vue svelte next tailwind express flask django fastapi node npm sdk version"},
    {"id": "coding-tools", "name": "Code search (Coding Tools MCP)", "repo": "https://github.com/xyTom/coding-tools-mcp", "license": "Apache-2.0",
     "transport": "stdio", "command": ["uvx", "coding-tools-mcp==0.5.0", "--stdio", "--workspace", "{workspace}"], "tools": ["search_text", "read_file", "list_files"], "per_workspace": True,
     "keywords": "find search where function class bug fix refactor rename usage import file code existing"},
    {"id": "sequential-thinking", "name": "Sequential thinking", "repo": "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking", "license": "MIT (relicensing to Apache-2.0)",
     "transport": "stdio", "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking@2.0.0"], "tools": ["sequentialthinking"],
     "keywords": "complex design architecture algorithm multi step plan migrate tricky"},
    {"id": "fetch", "name": "Fetch", "repo": "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch", "license": "MIT (relicensing to Apache-2.0)",
     "transport": "stdio", "command": ["uvx", "mcp-server-fetch==2026.10.19"], "tools": ["fetch"], "keywords": "http https url link page website api endpoint"},
    {"id": "git", "name": "Git (read-only)", "repo": "https://github.com/modelcontextprotocol/servers/tree/main/src/git", "license": "MIT (relicensing to Apache-2.0)",
     "transport": "stdio", "command": ["uvx", "mcp-server-git==2026.10.19", "--repository", "{workspace}"], "tools": ["git_status", "git_log", "git_diff", "git_show"], "per_workspace": True,
     "keywords": "git commit history change diff regression branch log"},
]

class McpError(RuntimeError): pass

# ---------- transports ----------
class StdioTransport:
    def __init__(self, argv, env=None, cwd=None, timeout=60):
        exe = shutil.which(argv[0]) or argv[0]
        self.p = subprocess.Popen([exe] + argv[1:], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  env=dict(os.environ, **(env or {})), cwd=cwd, text=True, encoding="utf-8", errors="replace", bufsize=1)
        self.q = queue.Queue(); self.timeout = timeout; self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()
    def _read(self):
        for line in self.p.stdout:
            line = line.strip()
            if not line: continue
            try: self.q.put(json.loads(line))
            except ValueError: pass                     # servers may log non-JSON lines
        self.q.put(None)
    def send(self, msg):
        with self.lock:
            if self.p.poll() is not None: raise McpError("server exited")
            self.p.stdin.write(json.dumps(msg) + "\n"); self.p.stdin.flush()
            if "id" not in msg: return None
            end = time.time() + self.timeout
            while True:
                try: r = self.q.get(timeout=max(0.1, end - time.time()))
                except queue.Empty: raise McpError("server timed out")
                if r is None: raise McpError("server exited")
                if r.get("id") == msg["id"] and ("result" in r or "error" in r): return r
    def close(self):
        try: self.p.terminate(); self.p.wait(5)
        except Exception: pass

class HttpTransport:
    def __init__(self, url, timeout=30, opener=None):
        self.url = url; self.timeout = timeout; self.sid = None; self.open = opener or urllib.request.urlopen
    def send(self, msg):
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL}
        if self.sid: h["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(self.url, data=json.dumps(msg).encode(), headers=h, method="POST")
        try:
            with self.open(req, timeout=self.timeout) as r:
                self.sid = r.headers.get("Mcp-Session-Id") or self.sid
                body = r.read().decode("utf-8", "replace"); ctype = r.headers.get("Content-Type", "")
        except Exception as e: raise McpError(f"http error: {e}")
        if "id" not in msg: return None
        if "text/event-stream" in ctype:
            for line in body.splitlines():
                if line.startswith("data:"):
                    try: d = json.loads(line[5:].strip())
                    except ValueError: continue
                    if d.get("id") == msg["id"]: return d
            raise McpError("no response in event stream")
        try: return json.loads(body)
        except ValueError: raise McpError("bad JSON from server")
    def close(self): pass

class McpClient:
    def __init__(self, transport):
        self.t = transport; self.n = 0; self.tools = []
    def _rpc(self, method, params=None):
        self.n += 1; r = self.t.send({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}})
        if "error" in r: raise McpError(str(r["error"].get("message", r["error"]))[:300])
        return r["result"]
    def start(self):
        self._rpc("initialize", {"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "freecode", "version": "0.4"}})
        self.t.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.tools = self._rpc("tools/list").get("tools", []); return self
    def call(self, name, args):
        r = self._rpc("tools/call", {"name": name, "arguments": args})
        text = "\n".join(c.get("text", "") for c in r.get("content", []) if c.get("type") == "text")
        if r.get("isError"): raise McpError(text[:300] or "tool error")
        return text
    def close(self): self.t.close()

# ---------- schema layer: the model's tool choice is validated like every other model output ----------
_PY = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}
def check_args(schema, args):
    """Small JSON-Schema subset check (required, types, enums, no unknown keys when closed). Returns a list of problems."""
    errs = []; props = (schema or {}).get("properties", {}) or {}
    for k in (schema or {}).get("required", []) or []:
        if k not in args: errs.append(f"missing required argument '{k}'")
    for k, v in args.items():
        if k not in props:
            if (schema or {}).get("additionalProperties") is False or props: errs.append(f"unknown argument '{k}'")
            continue
        t = props[k].get("type"); ts = t if isinstance(t, list) else [t] if t else []
        if ts and not any(isinstance(v, _PY[x]) and not (x in ("integer", "number") and isinstance(v, bool)) for x in ts if x in _PY): errs.append(f"'{k}' must be {'/'.join(ts)}")
        if "enum" in props[k] and v not in props[k]["enum"]: errs.append(f"'{k}' must be one of {props[k]['enum']}")
    return errs

class ToolCall(Strict):
    tool: Annotated[str, Field(min_length=1, max_length=80)]
    args: Dict[str, object] = {}

class ToolPick(Strict):
    calls: Annotated[List[ToolCall], Field(max_length=MAX_CALLS)]
    offered: ClassVar[dict] = {}
    @model_validator(mode="after")
    def _known(self):
        for c in self.calls:
            if c.tool not in self.offered: raise ValueError(f"unknown tool '{c.tool}': use one of {sorted(self.offered)}")
            errs = check_args(self.offered[c.tool].get("inputSchema"), c.args)
            if errs: raise ValueError(f"{c.tool}: " + "; ".join(errs))
        return self

def pick_schema(tools):
    return type("ToolPickFor", (ToolPick,), {"offered": {t["name"]: t for t in tools}, "__module__": __name__})

# ---------- hub ----------
def readonly(tool, allow=None):
    n = tool.get("name", "")
    if allow is not None: return n in allow
    ann = tool.get("annotations") or {}
    if ann.get("readOnlyHint") is True: return True
    return bool(READONLY.search(n)) and not WRITEY.search(n)

class McpHub:
    def __init__(self, data_dir, servers=None, factory=None):
        self.data = str(data_dir); self.servers = servers if servers is not None else CURATED
        self.factory = factory or self._connect; self.clients = {}; self.dead = {}; self.lock = threading.Lock()
        self.log = []
    def _fill(self, s, ws):
        return lambda x: x.replace("{data}", self.data).replace("{workspace}", str(ws or "."))
    def _connect(self, s, ws):
        f = self._fill(s, ws)
        if s["transport"] == "http": return McpClient(HttpTransport(s["url"])).start()
        argv = [f(x) for x in s["command"]]
        if not shutil.which(argv[0]): raise McpError(f"{argv[0]} is not available")
        return McpClient(StdioTransport(argv, env={k: f(v) for k, v in (s.get("env") or {}).items()}, cwd=str(ws) if ws else None, timeout=90)).start()
    def available(self):
        return [s for s in self.servers if s["transport"] == "http" or shutil.which(s["command"][0])]
    def settings_status(self):
        """Summarize configured servers from memory without starting or probing them."""
        with self.lock:
            connected = {key[0] for key in self.clients}
            unavailable = {key[0] for key, deadline in self.dead.items() if deadline > time.time()}
        servers = []
        for server in self.servers:
            if not isinstance(server, dict):
                continue
            server_id = server.get("id")
            name = server.get("name")
            transport = server.get("transport")
            if not isinstance(server_id, str) or not server_id or not isinstance(name, str) or not name:
                continue
            if transport not in ("stdio", "http"):
                continue
            status = "connected" if server_id in connected else "unavailable" if server_id in unavailable else "not checked"
            servers.append({"id": server_id[:80], "name": name[:120], "transport": transport, "status": status})
        return {"available": True, "servers": servers}
    def client(self, s, ws=None):
        key = (s["id"], str(ws) if s.get("per_workspace") else "")
        with self.lock:
            if key in self.clients: return self.clients[key]
            if self.dead.get(key, 0) > time.time(): return None
        try: c = self.factory(s, ws)
        except Exception as e:
            self.dead[key] = time.time() + 600; self.log.append({"server": s["id"], "error": str(e)[:200]}); return None
        with self.lock: self.clients[key] = c
        return c
    def tools_for(self, task, ws=None, k=MAX_TOOLS):
        """Rank servers by relevance to the task and return up to k read-only tools as dicts with a 'server' key."""
        words = set(re.findall(r"[a-z0-9]+", (task or "").lower()))
        ranked = sorted(self.servers, key=lambda s: -len(words & set(s.get("keywords", "").split())))
        groups = []
        for s in ranked:
            if not (words & set(s.get("keywords", "").split())): continue
            c = self.client(s, ws)
            if not c: continue
            order = s.get("tools") or []
            ts = sorted((t for t in c.tools if readonly(t, s.get("tools"))), key=lambda t: order.index(t["name"]) if t["name"] in order else 99)
            if ts: groups.append([dict(t, server=s["id"]) for t in ts[:PER_SERVER]])
        out = []                                       # round-robin, so one server cannot take every slot
        while len(out) < k and any(groups):
            for g in groups:
                if g and len(out) < k: out.append(g.pop(0))
        return out
    def call(self, tool, args, ws=None):
        s = next(x for x in self.servers if x["id"] == tool["server"]); c = self.client(s, ws)
        if not c: raise McpError("server unavailable")
        return c.call(tool["name"], args)[:MAX_RESULT]
    def run(self, tool, args, ws=None, task=""):
        """call() plus known follow-ups, so one model choice gets a useful answer (docs: resolve the library, then read it)."""
        r = self.call(tool, args, ws)
        if tool["server"] == "context7" and tool["name"] == "resolve-library-id":
            m = re.search(r"library ID:\s*(/\S+)", r)
            if m:
                q = args.get("query") or task[:200]
                try: r = f"Library {m.group(1)}\n" + self.call({"server": "context7", "name": "query-docs"}, {"libraryId": m.group(1), "query": q}, ws)
                except McpError: pass
        return r[:MAX_RESULT]
    def remember(self, project, note):
        s = next((x for x in self.servers if x["id"] == "memory"), None); c = s and self.client(s)
        if not c: return False
        try:
            c.call("create_entities", {"entities": [{"name": project, "entityType": "project", "observations": [note[:500]]}]})
        except McpError:
            try: c.call("add_observations", {"observations": [{"entityName": project, "contents": [note[:500]]}]})
            except McpError: return False
        return True
    def warm(self):
        """Start the shared (not per-workspace) servers in the background so the first task does not wait."""
        for s in self.available():
            if not s.get("per_workspace"): self.client(s)
    def close(self):
        for c in self.clients.values(): c.close()
        self.clients = {}

def describe(tools):
    return json.dumps([{"tool": t["name"], "about": (t.get("description") or "")[:300], "args": (t.get("inputSchema") or {}).get("properties", {})} for t in tools])[:6000]
