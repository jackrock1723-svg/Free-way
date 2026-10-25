"""One-click deploy of a static site with the user's own token (BYO, never logged or returned).
Hosts: Cloudflare Pages (wrangler), GitHub Pages (Git Data API), Netlify (zip deploy), Vercel (files API, Hobby plan is
non-commercial only), Render (deploy hook; the static site must already be connected to a repo)."""
import base64, hashlib, io, json, os, re, shutil, subprocess, tempfile, urllib.request, urllib.error, zipfile
from pathlib import Path

OPENER = urllib.request.urlopen
RUN = subprocess.run
HOSTS = {
    "cloudflare": {"name": "Cloudflare Pages", "fields": ["account_id", "api_token"], "note": "Free: unlimited static traffic, 500 builds a month."},
    "github": {"name": "GitHub Pages", "fields": ["token"], "note": "Free for public repos. Publishes to the gh-pages branch."},
    "netlify": {"name": "Netlify", "fields": ["token"], "note": "Free: 300 credits a month; the site pauses when they run out."},
    "vercel": {"name": "Vercel", "fields": ["token"], "note": "Hobby plan is for non-commercial use only."},
    "render": {"name": "Render", "fields": ["deploy_hook"], "note": "Static site must already be connected to a Git repo; the hook redeploys it."},
}
SKIP = {".git", "node_modules", ".freecode"}
MAX_FILES = 2000; MAX_BYTES = 50_000_000

class DeployError(Exception): pass

def site_files(root):
    root = Path(root); out = {}; total = 0
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if p.is_file() and not (set(rel.parts) & SKIP) and not p.is_symlink():
            b = p.read_bytes(); total += len(b); out[rel.as_posix()] = b
            if len(out) > MAX_FILES or total > MAX_BYTES: raise DeployError("site is too large for one-click deploy")
    if "index.html" not in out: raise DeployError("there is no index.html to deploy yet")
    return out

def slug(name):
    s = re.sub(r"[^a-z0-9-]+", "-", (name or "freecode-site").lower()).strip("-")[:50]
    return s or "freecode-site"

def _api(method, url, token=None, body=None, raw=None, ctype="application/json", auth="Bearer"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Accept": "application/json", "User-Agent": "Freeway"}
    if data is not None: h["Content-Type"] = ctype
    if token: h["Authorization"] = f"{auth} {token}"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with OPENER(req, timeout=60) as r:
            t = r.read().decode() or "{}"
            return json.loads(t) if t.strip()[:1] in "{[" else {"text": t}
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:300]
        if e.code in (401, 403): raise DeployError(f"the host rejected the token ({e.code}). Check it in Settings > Deploy")
        if e.code == 404 and method == "GET": return None
        raise DeployError(f"host error {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise DeployError(f"could not reach the host: {e.reason}")

def need(creds, *fields):
    for f in fields:
        v = creds.get(f)
        if not isinstance(v, str) or len(v) < 4 or any(c.isspace() for c in v): raise DeployError(f"add your {f.replace('_', ' ')} in Settings > Deploy")
    return [creds[f] for f in fields]

def netlify(files, name, creds, api="https://api.netlify.com/api/v1"):
    (tok,) = need(creds, "token")
    site = creds.get("site_id")
    if not site:
        s = _api("POST", f"{api}/sites", tok, {"name": slug(name) + "-" + hashlib.sha1(name.encode()).hexdigest()[:6]}); site = s["id"]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p, b in files.items(): z.writestr(p, b)
    d = _api("POST", f"{api}/sites/{site}/deploys", tok, raw=buf.getvalue(), ctype="application/zip")
    return {"url": d.get("ssl_url") or d.get("url") or d.get("deploy_ssl_url"), "site_id": site, "id": d.get("id")}

def vercel(files, name, creds, api="https://api.vercel.com"):
    (tok,) = need(creds, "token")
    body = {"name": slug(name), "target": "production", "projectSettings": {"framework": None},
            "files": [{"file": p, "data": base64.b64encode(b).decode(), "encoding": "base64"} for p, b in files.items()]}
    d = _api("POST", f"{api}/v13/deployments?skipAutoDetectionConfirmation=1", tok, body)
    u = d.get("url") or ""
    return {"url": u if u.startswith("http") else "https://" + u, "id": d.get("id")}

def github(files, name, creds, api="https://api.github.com"):
    """Publish to <owner>/<repo>@gh-pages via the Git Data API, then enable Pages on that branch."""
    (tok,) = need(creds, "token")
    me = _api("GET", f"{api}/user", tok, auth="token"); owner = me["login"]; repo = creds.get("repo") or slug(name)
    if _api("GET", f"{api}/repos/{owner}/{repo}", tok, auth="token") is None:
        _api("POST", f"{api}/user/repos", tok, {"name": repo, "auto_init": True, "description": "Built with Free way"}, auth="token")
    tree = []
    for p, b in files.items():
        blob = _api("POST", f"{api}/repos/{owner}/{repo}/git/blobs", tok, {"content": base64.b64encode(b).decode(), "encoding": "base64"}, auth="token")
        tree.append({"path": p, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    t = _api("POST", f"{api}/repos/{owner}/{repo}/git/trees", tok, {"tree": tree}, auth="token")
    ref = _api("GET", f"{api}/repos/{owner}/{repo}/git/ref/heads/gh-pages", tok, auth="token")
    parents = [ref["object"]["sha"]] if ref else []
    c = _api("POST", f"{api}/repos/{owner}/{repo}/git/commits", tok, {"message": "Deploy from Free way", "tree": t["sha"], "parents": parents}, auth="token")
    if ref: _api("PATCH", f"{api}/repos/{owner}/{repo}/git/refs/heads/gh-pages", tok, {"sha": c["sha"], "force": True}, auth="token")
    else: _api("POST", f"{api}/repos/{owner}/{repo}/git/refs", tok, {"ref": "refs/heads/gh-pages", "sha": c["sha"]}, auth="token")
    if _api("GET", f"{api}/repos/{owner}/{repo}/pages", tok, auth="token") is None:
        try: _api("POST", f"{api}/repos/{owner}/{repo}/pages", tok, {"source": {"branch": "gh-pages", "path": "/"}}, auth="token")
        except DeployError as e:
            if "409" not in str(e): raise
    return {"url": f"https://{owner}.github.io/{repo}/", "repo": f"{owner}/{repo}", "commit": c["sha"]}

def cloudflare(files, name, creds, root=None):
    """Cloudflare's Direct Upload is done with its own CLI (wrangler), which handles asset hashing."""
    acct, tok = need(creds, "account_id", "api_token")
    if not re.fullmatch(r"[0-9a-f]{32}", acct): raise DeployError("Cloudflare account id must be 32 hex characters")
    npx = shutil.which("npx")
    if not npx: raise DeployError("Cloudflare Pages deploy needs Node.js (npx wrangler)")
    proj = creds.get("project") or slug(name)
    env = dict(os.environ, CLOUDFLARE_ACCOUNT_ID=acct, CLOUDFLARE_API_TOKEN=tok, WRANGLER_SEND_METRICS="false")
    with tempfile.TemporaryDirectory() as d:
        for p, b in files.items():
            f = Path(d) / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(b)
        RUN([npx, "--yes", "wrangler@4", "pages", "project", "create", proj, "--production-branch", "main"], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
        r = RUN([npx, "--yes", "wrangler@4", "pages", "deploy", d, "--project-name", proj, "--branch", "main", "--commit-dirty=true"], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    out = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0: raise DeployError("wrangler failed: " + out.replace(tok, "***")[-300:])
    m = re.findall(r"https://[\w.-]+\.pages\.dev\S*", out)
    return {"url": m[-1] if m else f"https://{proj}.pages.dev", "project": proj}

def render(files, name, creds):
    (hook,) = need(creds, "deploy_hook")
    if not re.match(r"^https://api\.render\.com/deploy/srv-[\w-]+\?key=[\w-]+$", hook): raise DeployError("Render deploy hook must look like https://api.render.com/deploy/srv-...?key=...")
    d = _api("POST", hook)
    return {"url": creds.get("site_url"), "id": (d.get("deploy") or {}).get("id"), "note": "Render rebuilds from the connected repo; push these files there first."}

ADAPTERS = {"netlify": netlify, "vercel": vercel, "github": github, "cloudflare": cloudflare, "render": render}

def deploy(host, root, name, creds):
    if host not in ADAPTERS: raise DeployError("unknown host")
    files = site_files(root)
    res = ADAPTERS[host](files, name, creds)
    res.update(host=host, files=len(files), note=res.get("note") or HOSTS[host]["note"])
    return res
