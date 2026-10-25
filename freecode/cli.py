"""Free way command line: the same agents, helpers and integrations as the app, in a terminal.
  python -m freecode                    start the app server (same as `serve`)
  python -m freecode run "task"         plan, approve, build, review and suggest next steps
  python -m freecode chat|research "q"  chat, or a cited web-research answer
  python -m freecode interview "task"   three clarifying questions
  python -m freecode review|deploy ID   review an agent's work, or deploy it
  python -m freecode models             the free model brands
Add --mock to use the deterministic demo models (no keys, no network)."""
import argparse, base64, json, mimetypes, os, sys, time
from pathlib import Path

def _app(a):
    from .server import App
    return App(a.data, "local", None, a.mock)

def _img(path):
    p = Path(path); mt = mimetypes.guess_type(p.name)[0] or ""
    if not mt.startswith("image/"): raise SystemExit(f"not an image: {path}")
    return f"data:{mt};base64," + base64.b64encode(p.read_bytes()).decode()

def _out(a, obj, text):
    print(json.dumps(obj, indent=2) if a.json else text)

def _wait(app, aid, limit=600):
    t0 = time.time()
    while time.time() - t0 < limit:
        x = app.agents.get(aid)
        if x.state in ("review", "error", "merged", "rejected", "needs_plan_approval"): return x
        time.sleep(0.1)
    return app.agents.get(aid)

def cmd_run(a):
    from .vision import attach, describe
    from . import helpers
    app = _app(a); app.ws.create_project(a.project)
    prompt = a.prompt
    if a.image:
        d, _ = describe(app.router, [_img(i) for i in a.image]); prompt = attach(prompt, d)
    ag = app.agents.create(a.project, prompt, a.model, sync=True, think=a.think)
    if ag.state == "error": raise SystemExit(f"planning failed: {ag.error}")
    plan = ag.plan or {}
    if not a.json:
        if ag.thinking: print("Thinker:", ag.thinking["approach"], "\n")
        print(f"Plan ({ag.route.get('model') if ag.route else '?'}): {plan.get('summary', '')}")
        for i, x in enumerate(ag.actions): print(f"  {i + 1}. {x.get('type')} {x.get('path') or x.get('command') or ''}")
    if not a.yes:
        if not sys.stdin.isatty(): raise SystemExit("re-run with --yes to approve the plan non-interactively")
        if input("Approve and build? [y/N] ").strip().lower() != "y": app.agents.reject(ag.id); return print("Rejected.")
    app.agents.approve_plan(ag.id, "session"); ag = _wait(app, ag.id)
    if ag.state != "review": raise SystemExit(f"agent stopped in state {ag.state}: {ag.error or ''}")
    wt = app.ws.worktree_dir(ag.project, ag.id)
    rv, _ = helpers.review(app.router, ag.model, ag.prompt, app.ws.diff(wt), app.text_files(wt)); ag.review = rv
    sg, _ = helpers.suggestions(app.router, ag.model, ag.prompt, app.ws.files(wt)); ag.suggestions = sg; ag.checkpoint()
    files = app.ws.diff_files(wt)
    if a.merge: app.agents.merge(ag.id)
    res = {"id": ag.id, "state": app.agents.get(ag.id).state, "files": files, "checks": ag.checks, "review": rv, "suggestions": sg, "worktree": str(wt)}
    _out(a, res, "\n".join([f"\nAgent {ag.id}: {res['state']}  (checks: {ag.checks or 'none'})",
                            *[f"  +{f['added']} -{f['removed']}  {f['path']}" for f in res["files"]],
                            f"Review: {rv['verdict']} - {rv['summary']}", *[f"  [{f['severity']}] {f['file']}: {f['message']}" for f in rv["findings"][:8]],
                            "Next:", *[f"  - {s}" for s in sg], f"Files: {wt}"]))

def cmd_chat(a, mode):
    from . import research
    app = _app(a)
    keys = app.integrations.get("search")
    r = research.answer(app.router, a.model, [{"role": "user", "content": a.prompt}], mode, keys,
                        search_fn=research.mock_search if a.mock else None, read_fn=(lambda u: "") if a.mock else None)
    _out(a, r, r["reply"] + ("\n\nSources:\n" + "\n".join(f"[{s['n']}] {s['title']} - {s['url']}" for s in r["sources"]) if r["sources"] else ""))

def cmd_interview(a):
    from . import helpers
    q, _ = helpers.interview(_app(a).router, a.model, a.prompt); _out(a, {"questions": q}, "\n".join(f"{i + 1}. {x}" for i, x in enumerate(q)))

def cmd_review(a):
    from . import helpers
    app = _app(a); ag = app.agents.get(a.id); wt = app.ws.worktree_dir(ag.project, ag.id)
    rv, _ = helpers.review(app.router, ag.model, ag.prompt, app.ws.diff(wt), app.text_files(wt)); ag.review = rv; ag.checkpoint()
    _out(a, rv, f"{rv['verdict']}: {rv['summary']}\n" + "\n".join(f"  [{f['severity']}] {f['file']}:{f.get('line') or ''} {f['message']}" for f in rv["findings"]))

def cmd_deploy(a):
    from . import deploy
    app = _app(a); ag = app.agents.get(a.id); creds = app.integrations.get(f"deploy:{a.host}")
    if not creds: raise SystemExit(f"add your {deploy.HOSTS[a.host]['name']} token in the app (Settings > Deploy) first")
    try: r = deploy.deploy(a.host, app.ws.worktree_dir(ag.project, ag.id), a.name or f"{ag.project}-{ag.id}", creds)
    except deploy.DeployError as e: raise SystemExit(f"deploy failed: {e}")
    ag.deploys = (ag.deploys or []) + [dict(r, at=time.time())]; ag.checkpoint()
    _out(a, r, f"Live: {r.get('url')}\n{r['note']}")

def cmd_models(a):
    from . import catalog
    lst = [m for m in catalog.public_list() if m["free"] or a.all]
    _out(a, lst, "\n".join(f"{m['id']:<14} {m['name']:<16} {'free' if m['free'] else 'premium'}" for m in lst))

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try: sys.stdout.reconfigure(line_buffering=True)
    except AttributeError: pass
    if not argv or argv[0] in ("serve",) or argv[0].startswith("-") and argv[0] not in ("-h", "--help"):
        from .server import main as serve
        return serve(argv[1:] if argv and argv[0] == "serve" else argv)
    ap = argparse.ArgumentParser(prog="freecode", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    def common(p, prompt=True):
        if prompt: p.add_argument("prompt")
        p.add_argument("--model", default="auto"); p.add_argument("--mock", action="store_true")
        p.add_argument("--data", default=os.environ.get("FREECODE_DATA", os.path.expanduser("~/.freecode"))); p.add_argument("--json", action="store_true")
        return p
    r = common(sub.add_parser("run", help="build something with an agent"))
    r.add_argument("--project", default="demo"); r.add_argument("--yes", "-y", action="store_true", help="approve the plan without asking")
    r.add_argument("--image", action="append", help="attach an image (repeatable)"); r.add_argument("--think", action="store_true", help="/plan: think first")
    r.add_argument("--merge", action="store_true")
    common(sub.add_parser("chat")); common(sub.add_parser("research")); common(sub.add_parser("interview"))
    v = common(sub.add_parser("review"), False); v.add_argument("id")
    d = common(sub.add_parser("deploy"), False); d.add_argument("id"); d.add_argument("--host", required=True, choices=["cloudflare", "github", "netlify", "vercel", "render"]); d.add_argument("--name")
    m = common(sub.add_parser("models"), False); m.add_argument("--all", action="store_true")
    a = ap.parse_args(argv)
    from .providers import ProviderError
    try:
        {"run": cmd_run, "chat": lambda a: cmd_chat(a, "chat"), "research": lambda a: cmd_chat(a, "research"), "interview": cmd_interview,
         "review": cmd_review, "deploy": cmd_deploy, "models": cmd_models}[a.cmd](a)
    except ProviderError as e: raise SystemExit(f"model error: {e}")
    except (KeyError, ValueError) as e: raise SystemExit(f"error: {e}")
    sys.stdout.flush(); sys.stderr.flush(); os._exit(0)     # background agent threads must not keep the CLI alive

if __name__ == "__main__": main()
