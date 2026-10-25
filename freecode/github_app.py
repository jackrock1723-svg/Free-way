"""GitHub cloud agent with the user's own GitHub App (BYO App ID + private key). Free way imports a repo into a
workspace project, runs a normal agent on it, then pushes the agent branch and opens a pull request.
The App JWT is signed with the system openssl (RS256), so there is no extra dependency."""
import base64, json, os, re, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from .workspace import git

API = os.environ.get("FC_GITHUB_API", "https://api.github.com")
GIT_HOST = os.environ.get("FC_GITHUB_GIT", "https://github.com")
OPENER = urllib.request.urlopen
REPO_RX = re.compile(r"^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$")

class GitHubError(Exception): pass

def b64u(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def app_jwt(app_id, pem, now=None):
    if not re.fullmatch(r"\d{1,12}", str(app_id or "")): raise GitHubError("GitHub App ID must be a number")
    if "PRIVATE KEY-----" not in (pem or ""): raise GitHubError("paste the App's private key (.pem)")
    now = int(now or time.time())
    head = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()); body = b64u(json.dumps({"iat": now - 60, "exp": now + 540, "iss": str(app_id)}).encode())
    msg = f"{head}.{body}".encode()
    fd, kp = tempfile.mkstemp(suffix=".pem")
    try:
        os.chmod(kp, 0o600); os.write(fd, pem.encode()); os.close(fd)
        r = subprocess.run(["openssl", "dgst", "-sha256", "-sign", kp], input=msg, capture_output=True, timeout=20)
    finally:
        try: os.remove(kp)
        except OSError: pass
    if r.returncode != 0: raise GitHubError("could not sign with that private key")
    return f"{head}.{body}.{b64u(r.stdout)}"

def _api(method, path, token, body=None, scheme="Bearer"):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": f"{scheme} {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                                          "User-Agent": "Freeway", **({"Content-Type": "application/json"} if body is not None else {})})
    try:
        with OPENER(req, timeout=30) as r: return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        if e.code == 404: raise GitHubError("the App is not installed on that repository (or it does not exist)")
        if e.code in (401, 403): raise GitHubError(f"GitHub refused the App credentials ({e.code})")
        raise GitHubError(f"GitHub error {e.code}: {detail}")
    except urllib.error.URLError as e: raise GitHubError(f"could not reach GitHub: {e.reason}")

def install_token(creds, repo):
    if not REPO_RX.match(repo or ""): raise GitHubError("repository must look like owner/name")
    j = app_jwt(creds.get("app_id"), creds.get("private_key"))
    inst = _api("GET", f"/repos/{repo}/installation", j)
    tok = _api("POST", f"/app/installations/{inst['id']}/access_tokens", j, {"repositories": [repo.split("/")[1]], "permissions": {"contents": "write", "pull_requests": "write"}})
    return tok["token"]

def _url(repo, token): return f"{GIT_HOST.replace('://', f'://x-access-token:{token}@', 1)}/{repo}.git"

def import_repo(ws, pid, repo, token, branch=None):
    """Shallow-clone into a workspace project. The local default branch is called main, as agents expect."""
    d = ws.project_dir(pid)
    if d.exists(): raise GitHubError(f"project {pid} already exists")
    d.parent.mkdir(parents=True, exist_ok=True)
    args = ["clone", "-q", "--depth", "50"] + (["--branch", branch] if branch else []) + [_url(repo, token), str(d)]
    r = subprocess.run(["git"] + args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    if r.returncode != 0: raise GitHubError("clone failed: " + (r.stderr or "").replace(token, "***")[-200:])
    base = git(d, "rev-parse", "--abbrev-ref", "HEAD").strip()
    git(d, "remote", "set-url", "origin", f"{GIT_HOST}/{repo}.git")     # never keep the token on disk
    if base != "main": git(d, "branch", "-M", base, "main")
    (d / ".freecode-github.json").write_text(json.dumps({"repo": repo, "base": base}), encoding="utf-8")
    git(d, "config", "user.email", "agent@freecode.local"); git(d, "config", "user.name", "Free way")
    info = d / ".git" / "info" / "exclude"; info.parent.mkdir(exist_ok=True); info.write_text((info.read_text(encoding="utf-8") if info.exists() else "") + "\n.freecode-github.json\n", encoding="utf-8")
    return {"project": pid, "repo": repo, "base": base}

def meta(ws, pid):
    f = ws.project_dir(pid) / ".freecode-github.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None

def open_pr(ws, agent, token, title=None, body=None):
    m = meta(ws, agent.project)
    if not m: raise GitHubError("this project is not linked to a GitHub repository")
    wt = ws.worktree_dir(agent.project, agent.id); ws.commit(wt, f"Free way: {agent.title}")
    branch = f"freecode/{agent.id}"
    r = subprocess.run(["git", "push", "-q", _url(m["repo"], token), f"HEAD:refs/heads/{branch}"], cwd=wt, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    if r.returncode != 0: raise GitHubError("push failed: " + (r.stderr or "").replace(token, "***")[-200:])
    pr = _api("POST", f"/repos/{m['repo']}/pulls", token, {"title": (title or agent.title)[:200], "head": branch, "base": m["base"],
                                                         "body": body or f"Opened by Free way.\n\nTask: {agent.prompt[:1500]}"}, scheme="token")
    return {"url": pr.get("html_url"), "number": pr.get("number"), "branch": branch}
