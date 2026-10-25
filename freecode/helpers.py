"""Helper agents: file-picker, thinker, code-reviewer, browser-use, plus /interview questions and follow-up
suggestions. Model calls go through the typed layer (strict schemas, auto-repair, fallback)."""
import json, re, shutil
from typing import List, Literal, Optional
from pydantic import Field
from .schema import Strict

Short = Field(min_length=1, max_length=400)
class Thought(Strict):
    analysis: str = Field(min_length=1, max_length=2000)
    risks: List[str] = Field(max_length=6)
    approach: str = Field(min_length=1, max_length=1200)
class Finding(Strict):
    file: str = Field(min_length=1, max_length=200)
    severity: Literal["info", "warn", "error"]
    message: str = Short
    line: Optional[int] = None
class Review(Strict):
    summary: str = Field(min_length=1, max_length=800)
    verdict: Literal["approve", "changes"]
    findings: List[Finding] = Field(max_length=20)
class Interview(Strict):
    questions: List[str] = Field(min_length=3, max_length=3)
class Suggestions(Strict):
    suggestions: List[str] = Field(min_length=3, max_length=3)

def _helper(kind, instructions):
    return {"role": "system", "content": f"HELPER {kind}\nYou are Free way's {kind} helper. {instructions}\nReply with one JSON object only, no prose, no code fences."}

# ---------- file-picker (no model call: fast, deterministic) ----------
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")
STOP = set("the and for with that this from into your you are can not but all any use make add build app create page file files code".split())
def file_picker(files, query, k=8):
    """Rank project files by relevance to the task. `files` maps path -> text. Returns [{path, score, why}]."""
    q = {w.lower() for w in _WORD.findall(query or "")} - STOP
    out = []
    for path, text in files.items():
        name = path.lower(); body = (text or "")[:20000].lower()
        hits_name = sorted(w for w in q if w in name); hits_body = sorted(w for w in q if w in body)
        score = 3 * len(hits_name) + len(hits_body) + (1 if path.endswith((".html", ".js", ".ts", ".py", ".css")) else 0) + (2 if name in ("index.html", "package.json", "readme.md") else 0)
        if score: out.append({"path": path, "score": score, "why": ("name: " + ", ".join(hits_name) if hits_name else "") + ("; " if hits_name and hits_body else "") + ("mentions: " + ", ".join(hits_body[:5]) if hits_body else "") or "entry file"})
    return sorted(out, key=lambda x: (-x["score"], x["path"]))[:k]

def picked_context(files, query, budget=24000, k=6):
    parts = []; used = 0
    for f in file_picker(files, query, k):
        t = files[f["path"]][: max(0, budget - used)]
        if not t: break
        parts.append(f"--- {f['path']} ---\n{t}"); used += len(t)
    return "\n".join(parts)

# ---------- thinker ----------
def think(router, brand, task, context=""):
    msgs = [_helper("thinker", 'Think about the task before any code is planned. Return {"analysis": str, "risks": [str], "approach": str}.'),
            {"role": "user", "content": f"Task: {task}\n\n{('Relevant files:\n' + context) if context else ''}"}]
    obj, route = router.complete_typed(brand, msgs, schema=Thought, skill="plan", retries=1)
    return obj.model_dump(), route

# ---------- code-reviewer ----------
STATIC = [(re.compile(r"\beval\s*\("), "error", "eval() runs arbitrary code"),
          (re.compile(r"\.innerHTML\s*=(?!\s*['\"]{2})"), "warn", "innerHTML with dynamic content can allow XSS; prefer textContent"),
          (re.compile(r"\bdocument\.write\s*\("), "warn", "document.write blocks rendering"),
          (re.compile(r"(sk|pk|ghp|gho|nvapi|xox[abp])[-_][A-Za-z0-9_-]{12,}"), "error", "looks like a hard-coded secret"),
          (re.compile(r"\bconsole\.log\("), "info", "console.log left in code"),
          (re.compile(r"\b(TODO|FIXME)\b"), "info", "unfinished TODO")]
def static_review(files):
    out = []
    for path, text in sorted(files.items()):
        if not path.endswith((".js", ".ts", ".html", ".mjs", ".jsx", ".tsx", ".py")) or path.endswith((".test.js", ".spec.js")): continue
        for i, line in enumerate((text or "").splitlines()[:4000], 1):
            for rx, sev, msg in STATIC:
                if rx.search(line): out.append({"file": path, "line": i, "severity": sev, "message": msg})
    return out[:20]

def review(router, brand, task, diff, files):
    static = static_review(files)
    msgs = [_helper("code-reviewer", 'Review the diff for bugs, broken behaviour, accessibility and security. '
                    'Return {"summary": str, "verdict": "approve"|"changes", "findings": [{"file": str, "line": int|null, "severity": "info"|"warn"|"error", "message": str}]}.'),
            {"role": "user", "content": f"Task: {task}\n\nDiff:\n{diff[:30000]}"}]
    obj, route = router.complete_typed(brand, msgs, schema=Review, skill="code", retries=1)
    r = obj.model_dump(); seen = {(f["file"], f.get("line"), f["message"]) for f in r["findings"]}
    r["findings"] += [f for f in static if (f["file"], f["line"], f["message"]) not in seen][: max(0, 20 - len(r["findings"]))]
    if any(f["severity"] == "error" for f in r["findings"]): r["verdict"] = "changes"
    return r, route

# ---------- browser-use ----------
def browser_check(url, shot=None, timeout=15000):
    """Open the preview in headless Chrome: page errors, console errors, title, interactive elements, first-button smoke click."""
    try: from playwright.sync_api import sync_playwright
    except ImportError: return {"ok": False, "skipped": "playwright is not installed"}
    exe = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    rep = {"url": url, "errors": [], "console": [], "title": None, "buttons": 0, "links": 0, "inputs": 0, "clicked": None, "broken": []}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]) if exe else p.chromium.launch()
            try:
                pg = b.new_page(viewport={"width": 390, "height": 844})
                pg.on("pageerror", lambda e: rep["errors"].append(str(e)[:300]))
                pg.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource") and rep["console"].append(m.text[:300]))
                pg.on("response", lambda r: r.status >= 400 and not r.url.endswith("/favicon.ico") and rep["broken"].append(f"{r.status} {r.url[-120:]}"))
                pg.goto(url, timeout=timeout, wait_until="load"); pg.wait_for_timeout(300)
                rep["title"] = pg.title()
                rep.update(buttons=pg.locator("button:visible").count(), links=pg.locator("a:visible").count(), inputs=pg.locator("input:visible,textarea:visible").count())
                if rep["buttons"]:
                    t = pg.locator("button:visible").first; label = (t.inner_text() or "").strip()[:60]
                    try: t.click(timeout=3000); pg.wait_for_timeout(300); rep["clicked"] = label or "(button)"
                    except Exception as e: rep["errors"].append(f"could not click first button: {type(e).__name__}")
                if shot: pg.screenshot(path=shot)
            finally: b.close()
    except Exception as e:
        rep["errors"].append(f"browser failed: {type(e).__name__}: {str(e)[:200]}")
    rep["ok"] = not rep["errors"] and not rep["console"] and not rep["broken"]
    return rep

# ---------- /interview and follow-ups ----------
def interview(router, brand, task):
    msgs = [_helper("interviewer", 'Ask exactly 3 short clarifying questions that would most change how the task is built. Return {"questions": [str, str, str]}.'),
            {"role": "user", "content": f"Task: {task}"}]
    obj, route = router.complete_typed(brand, msgs, schema=Interview, skill="fast", retries=1)
    return [q.strip() for q in obj.questions], route

def suggestions(router, brand, task, files):
    msgs = [_helper("suggester", 'Suggest exactly 3 useful next tasks for this project, each under 80 characters, written as instructions. Return {"suggestions": [str, str, str]}.'),
            {"role": "user", "content": f"Task just finished: {task}\nFiles: {', '.join(sorted(files)[:40])}"}]
    obj, route = router.complete_typed(brand, msgs, schema=Suggestions, skill="fast", retries=1)
    return [s.strip()[:120] for s in obj.suggestions], route

def mock_reply(kind, user):
    """Deterministic helper answers for the mock provider."""
    t = user.lower()
    if kind == "tool-picker":
        import json as _j
        try: tools = _j.loads(user.split("\n\nTools: ", 1)[1])
        except (IndexError, ValueError): return {"calls": []}
        for t in tools:
            req = [k for k, v in t["args"].items() if v.get("type") == "string"]
            if req: return {"calls": [{"tool": t["tool"], "args": {req[0]: user.split("\n", 1)[0][6:80]}}]}
        return {"calls": []}
    if kind == "thinker":
        return {"analysis": "The task needs a small static web app with clear structure.", "risks": ["Data must survive a reload", "Must work on a phone screen"], "approach": "Write index.html and app.js, keep state in localStorage, add a node test."}
    if kind == "code-reviewer":
        return {"summary": "The change is small and readable.", "verdict": "approve", "findings": [{"file": "index.html", "line": None, "severity": "info", "message": "Consider a <meta name=\"description\"> for sharing."}]}
    if kind == "interviewer":
        return {"questions": ["Who will use it, and on which device?", "Should data be saved between visits?", "Any style or colour you want?"]}
    if kind == "suggester":
        return {"suggestions": ["Add a dark and light theme toggle", "Add tests for the main functions", "Make it work offline as a PWA"]}
    raise ValueError(kind)
