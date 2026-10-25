import json, re, urllib.request, urllib.error, urllib.parse

class ConnectorError(Exception):
    def __init__(self, msg, status=400): super().__init__(msg); self.status = status

OPENER = urllib.request.urlopen
def set_opener(fn):
    global OPENER; OPENER = fn

# API base URLs. Tests point these at a local mock server.
BASES = {
    "graph": "https://graph.facebook.com/v21.0", "gmail": "https://gmail.googleapis.com/gmail/v1", "msgraph": "https://graph.microsoft.com/v1.0",
    "slack": "https://slack.com/api", "discord": "https://discord.com/api/v10", "telegram": "https://api.telegram.org",
    "gdrive": "https://www.googleapis.com/drive/v3", "notion": "https://api.notion.com/v1", "github": "https://api.github.com",
    "gcal": "https://www.googleapis.com/calendar/v3", "linear": "https://api.linear.app", "jira": None,
    "google_oauth": "https://oauth2.googleapis.com", "ms_oauth": "https://login.microsoftonline.com/common/oauth2/v2.0",
    "slack_oauth": "https://slack.com/api", "github_oauth": "https://github.com/login/oauth", "notion_oauth": "https://api.notion.com/v1/oauth",
    "linear_oauth": "https://api.linear.app/oauth",
}

def http(method, url, token=None, body=None, scheme="Bearer", headers=None, form=False):
    h = {"Accept": "application/json", "User-Agent": "Freeway"}
    if token: h["Authorization"] = f"{scheme} {token}"
    data = None
    if body is not None:
        if form: data = urllib.parse.urlencode(body).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
        else: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with OPENER(req, timeout=30) as r:
            t = r.read().decode("utf-8", "replace")
            return json.loads(t) if t.strip()[:1] in "{[" else {"text": t}
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:200]
        if e.code in (401, 403): raise ConnectorError(f"the service rejected the credentials ({e.code}). Reconnect it in Connectors", 401)
        if e.code == 404: raise ConnectorError("not found", 404)
        if e.code == 429: raise ConnectorError("the service is rate limiting requests; try again shortly", 429)
        raise ConnectorError(f"service error {e.code}: {msg}", 502)
    except urllib.error.URLError as e:
        raise ConnectorError(f"could not reach the service: {e.reason}", 502)

def q(s): return urllib.parse.quote(str(s), safe="")

class Connector:
    """id, name, group, auth: 'token' | 'oauth'. fields: BYO setup fields. oauth: provider config for your own app.
    Implementations return plain dicts: items have {id, title, snippet, from?, at?, url?}."""
    id = ""; name = ""; group = ""; auth = "token"; fields = []; secret_fields = []; optional = (); oauth = None; blurb = ""; docs = ""
    can = ("search", "read", "draft", "send")
    draft_fields = ("to", "subject", "text")
    def __init__(self, creds): self.c = creds or {}
    def tok(self): return self.c.get("access_token") or self.c.get("token")
    def need(self, *f):
        for k in f:
            if not self.c.get(k): raise ConnectorError(f"{self.name} is not connected: missing {k.replace('_', ' ')}", 401)
    def check(self): return self.search("", 1) is not None
    def search(self, query, limit=10): raise ConnectorError("search is not supported here")
    def read(self, item_id): raise ConnectorError("read is not supported here")
    def validate_draft(self, d):
        if not str(d.get("text") or "").strip(): raise ConnectorError("the message is empty")
        if "to" in self.draft_fields and not str(d.get("to") or "").strip(): raise ConnectorError("choose who it goes to")
        return {k: str(d.get(k) or "")[:20000] for k in self.draft_fields}
    def send(self, d): raise ConnectorError("sending is not supported here")

REGISTRY = {}
def register(cls): REGISTRY[cls.id] = cls; return cls
def get(cid):
    if cid not in REGISTRY: raise ConnectorError("unknown connector", 404)
    return REGISTRY[cid]
