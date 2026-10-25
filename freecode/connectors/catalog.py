"""The 13 connectors. Each maps search / read / send onto the service's public REST API."""
import base64, re, time
from email.message import EmailMessage
from .base import Connector, ConnectorError, register, http, q, BASES

def _b(k): return BASES[k]
def _txt(s, n=300): return re.sub(r"\s+", " ", str(s or "")).strip()[:n]

G_OAUTH = lambda scopes: {"authorize": "https://accounts.google.com/o/oauth2/v2/auth", "token": lambda: _b("google_oauth") + "/token", "scopes": scopes,
                          "extra": {"access_type": "offline", "prompt": "consent"}, "console": "console.cloud.google.com/apis/credentials"}
MS_OAUTH = {"authorize": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "token": lambda: _b("ms_oauth") + "/token",
            "scopes": ["offline_access", "Mail.ReadWrite", "Mail.Send"], "console": "entra.microsoft.com (App registrations)"}

# ---------- Meta: WhatsApp, Messenger, Instagram ----------
@register
class WhatsApp(Connector):
    id = "whatsapp"; name = "WhatsApp"; group = "Messaging"; blurb = "Read and reply to WhatsApp Business messages (Cloud API)."
    fields = ["token", "phone_number_id", "waba_id"]; secret_fields = ["token"]; optional = ("waba_id",); docs = "developers.facebook.com/docs/whatsapp/cloud-api"
    draft_fields = ("to", "text")
    def check(self):
        self.need("token", "phone_number_id"); return bool(http("GET", f"{_b('graph')}/{q(self.c['phone_number_id'])}", self.tok()).get("id"))
    def search(self, query, limit=10):
        # The Cloud API delivers inbound messages by webhook only; Free way keeps the ones its webhook received.
        self.need("token", "phone_number_id")
        msgs = self.c.get("_inbox", [])
        return [m for m in msgs if query.lower() in (m.get("snippet", "") + m.get("from", "")).lower()][:limit]
    def read(self, item_id):
        for m in self.c.get("_inbox", []):
            if m["id"] == item_id: return m
        raise ConnectorError("message not found", 404)
    def validate_draft(self, d):
        d = super().validate_draft(d)
        if not re.fullmatch(r"\+?\d{7,15}", d["to"].replace(" ", "")): raise ConnectorError("WhatsApp needs a phone number with country code")
        return d
    def send(self, d):
        self.need("token", "phone_number_id")
        r = http("POST", f"{_b('graph')}/{q(self.c['phone_number_id'])}/messages", self.tok(),
                 {"messaging_product": "whatsapp", "to": d["to"].lstrip("+").replace(" ", ""), "type": "text", "text": {"body": d["text"]}})
        return {"id": (r.get("messages") or [{}])[0].get("id")}

@register
class Messenger(Connector):
    id = "messenger"; name = "Facebook Pages and Messenger"; group = "Messaging"; blurb = "Page conversations and replies."
    fields = ["page_token", "page_id"]; secret_fields = ["page_token"]; docs = "developers.facebook.com/docs/messenger-platform"
    draft_fields = ("to", "text")
    def tok(self): return self.c.get("page_token")
    def search(self, query, limit=10):
        self.need("page_token", "page_id")
        r = http("GET", f"{_b('graph')}/{q(self.c['page_id'])}/conversations?fields=id,snippet,updated_time,participants&limit={limit}", self.tok())
        out = [{"id": c["id"], "title": ", ".join(p.get("name", "") for p in c.get("participants", {}).get("data", [])[:2]) or "Conversation",
                "snippet": _txt(c.get("snippet")), "at": c.get("updated_time")} for c in r.get("data", [])]
        return [x for x in out if not query or query.lower() in (x["title"] + x["snippet"]).lower()]
    def read(self, item_id):
        self.need("page_token")
        r = http("GET", f"{_b('graph')}/{q(item_id)}?fields=messages{{message,from,created_time}}", self.tok())
        return {"id": item_id, "messages": [{"from": (m.get("from") or {}).get("name"), "text": m.get("message"), "at": m.get("created_time")} for m in (r.get("messages") or {}).get("data", [])]}
    def send(self, d):
        self.need("page_token", "page_id")
        r = http("POST", f"{_b('graph')}/{q(self.c['page_id'])}/messages", self.tok(), {"recipient": {"id": d["to"]}, "messaging_type": "RESPONSE", "message": {"text": d["text"]}})
        return {"id": r.get("message_id")}

@register
class Instagram(Connector):
    id = "instagram"; name = "Instagram"; group = "Social"; blurb = "Your posts, comments and replies (Graph API, professional accounts)."
    fields = ["token", "ig_user_id"]; secret_fields = ["token"]; docs = "developers.facebook.com/docs/instagram-platform"
    draft_fields = ("to", "text")       # to = comment id to reply to
    def search(self, query, limit=10):
        self.need("token", "ig_user_id")
        r = http("GET", f"{_b('graph')}/{q(self.c['ig_user_id'])}/media?fields=id,caption,permalink,timestamp,comments_count&limit={limit}", self.tok())
        out = [{"id": m["id"], "title": _txt(m.get("caption"), 80) or "Post", "snippet": f"{m.get('comments_count', 0)} comments", "url": m.get("permalink"), "at": m.get("timestamp")} for m in r.get("data", [])]
        return [x for x in out if not query or query.lower() in x["title"].lower()]
    def read(self, item_id):
        self.need("token")
        r = http("GET", f"{_b('graph')}/{q(item_id)}/comments?fields=id,text,username,timestamp", self.tok())
        return {"id": item_id, "comments": [{"id": c["id"], "from": c.get("username"), "text": c.get("text"), "at": c.get("timestamp")} for c in r.get("data", [])]}
    def send(self, d):
        self.need("token")
        return {"id": http("POST", f"{_b('graph')}/{q(d['to'])}/replies", self.tok(), {"message": d["text"]}).get("id")}

# ---------- Mail ----------
@register
class Gmail(Connector):
    id = "gmail"; name = "Gmail"; group = "Mail"; auth = "oauth"; blurb = "Search, read and draft email."
    fields = ["client_id", "client_secret"]; secret_fields = ["client_secret"]; docs = "developers.google.com/gmail/api"
    oauth = G_OAUTH(["https://www.googleapis.com/auth/gmail.modify"])
    def search(self, query, limit=10):
        self.need("access_token")
        r = http("GET", f"{_b('gmail')}/users/me/messages?maxResults={limit}&q={q(query)}", self.tok())
        out = []
        for m in r.get("messages", [])[:limit]:
            d = http("GET", f"{_b('gmail')}/users/me/messages/{q(m['id'])}?format=metadata&metadataHeaders=Subject&metadataHeaders=From", self.tok())
            hd = {h["name"]: h["value"] for h in d.get("payload", {}).get("headers", [])}
            out.append({"id": m["id"], "title": hd.get("Subject", "(no subject)"), "from": hd.get("From"), "snippet": _txt(d.get("snippet"))})
        return out
    def read(self, item_id):
        self.need("access_token")
        d = http("GET", f"{_b('gmail')}/users/me/messages/{q(item_id)}?format=full", self.tok())
        hd = {h["name"]: h["value"] for h in d.get("payload", {}).get("headers", [])}
        def body(p):
            if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data"):
                return base64.urlsafe_b64decode(p["body"]["data"] + "==").decode("utf-8", "replace")
            for c in p.get("parts", []) or []:
                t = body(c)
                if t: return t
            return ""
        return {"id": item_id, "title": hd.get("Subject"), "from": hd.get("From"), "to": hd.get("To"), "text": body(d.get("payload", {}))[:20000] or d.get("snippet")}
    def send(self, d):
        self.need("access_token")
        m = EmailMessage(); m["To"] = d["to"]; m["Subject"] = d.get("subject") or ""; m.set_content(d["text"])
        raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
        return {"id": http("POST", f"{_b('gmail')}/users/me/messages/send", self.tok(), {"raw": raw}).get("id")}

@register
class Outlook(Connector):
    id = "outlook"; name = "Outlook"; group = "Mail"; auth = "oauth"; blurb = "Microsoft 365 and Outlook.com mail."
    fields = ["client_id", "client_secret"]; secret_fields = ["client_secret"]; docs = "learn.microsoft.com/graph/api/resources/mail-api-overview"
    oauth = MS_OAUTH
    def search(self, query, limit=10):
        self.need("access_token")
        url = f"{_b('msgraph')}/me/messages?$top={limit}&$select=id,subject,from,bodyPreview,receivedDateTime" + (f"&$search={q(chr(34) + query + chr(34))}" if query else "")
        r = http("GET", url, self.tok(), headers={"ConsistencyLevel": "eventual"})
        return [{"id": m["id"], "title": m.get("subject") or "(no subject)", "from": ((m.get("from") or {}).get("emailAddress") or {}).get("address"),
                 "snippet": _txt(m.get("bodyPreview")), "at": m.get("receivedDateTime")} for m in r.get("value", [])]
    def read(self, item_id):
        self.need("access_token")
        m = http("GET", f"{_b('msgraph')}/me/messages/{q(item_id)}?$select=subject,from,toRecipients,body", self.tok(), headers={"Prefer": 'outlook.body-content-type="text"'})
        return {"id": item_id, "title": m.get("subject"), "from": ((m.get("from") or {}).get("emailAddress") or {}).get("address"), "text": (m.get("body") or {}).get("content", "")[:20000]}
    def send(self, d):
        self.need("access_token")
        http("POST", f"{_b('msgraph')}/me/sendMail", self.tok(), {"message": {"subject": d.get("subject") or "", "body": {"contentType": "Text", "content": d["text"]},
                                                                              "toRecipients": [{"emailAddress": {"address": a.strip()}} for a in d["to"].split(",") if a.strip()]}})
        return {"id": None}

# ---------- Chat ----------
@register
class Slack(Connector):
    id = "slack"; name = "Slack"; group = "Messaging"; blurb = "Channels, threads and replies."
    fields = ["token"]; secret_fields = ["token"]; docs = "api.slack.com/apps"; draft_fields = ("to", "text")
    def _ok(self, r):
        if not r.get("ok"): raise ConnectorError("Slack: " + str(r.get("error", "request failed")), 401 if r.get("error") in ("invalid_auth", "not_authed") else 400)
        return r
    def check(self): self.need("token"); return self._ok(http("POST", f"{_b('slack')}/auth.test", self.tok()))["ok"]
    def search(self, query, limit=10):
        self.need("token")
        if query and self.tok().startswith("xoxp-"):      # message search needs a user token
            r = self._ok(http("GET", f"{_b('slack')}/search.messages?count={limit}&query={q(query)}", self.tok()))
            return [{"id": f"{m['channel']['id']}:{m['ts']}", "title": "#" + m["channel"].get("name", ""), "from": m.get("username"), "snippet": _txt(m.get("text")), "url": m.get("permalink")} for m in r["messages"]["matches"]]
        r = self._ok(http("GET", f"{_b('slack')}/conversations.list?limit=200&types=public_channel,private_channel", self.tok()))
        return [{"id": c["id"], "title": "#" + c["name"], "snippet": _txt((c.get("topic") or {}).get("value") or (c.get("purpose") or {}).get("value"))} for c in r.get("channels", []) if not query or query.lower() in c["name"].lower()][:limit]
    def read(self, item_id):
        self.need("token"); ch = item_id.split(":")[0]
        r = self._ok(http("GET", f"{_b('slack')}/conversations.history?channel={q(ch)}&limit=30", self.tok()))
        return {"id": ch, "messages": [{"from": m.get("user"), "text": m.get("text"), "at": m.get("ts")} for m in r.get("messages", [])]}
    def send(self, d):
        self.need("token"); to, _, ts = d["to"].partition(":")
        r = self._ok(http("POST", f"{_b('slack')}/chat.postMessage", self.tok(), dict({"channel": to, "text": d["text"]}, **({"thread_ts": ts} if ts else {}))))
        return {"id": r.get("ts")}

@register
class Discord(Connector):
    id = "discord"; name = "Discord"; group = "Messaging"; blurb = "Server channels through your bot."
    fields = ["token", "guild_id"]; secret_fields = ["token"]; docs = "discord.com/developers/applications"; draft_fields = ("to", "text")
    def tok(self): return self.c.get("token")
    def _h(self, m, path, body=None): return http(m, _b("discord") + path, self.tok(), body, scheme="Bot")
    def search(self, query, limit=10):
        self.need("token", "guild_id")
        chans = [c for c in self._h("GET", f"/guilds/{q(self.c['guild_id'])}/channels") if c.get("type") == 0]
        return [{"id": c["id"], "title": "#" + c["name"], "snippet": _txt(c.get("topic"))} for c in chans if not query or query.lower() in c["name"].lower()][:limit]
    def read(self, item_id):
        self.need("token")
        return {"id": item_id, "messages": [{"from": (m.get("author") or {}).get("username"), "text": m.get("content"), "at": m.get("timestamp")} for m in self._h("GET", f"/channels/{q(item_id)}/messages?limit=30")]}
    def send(self, d): self.need("token"); return {"id": self._h("POST", f"/channels/{q(d['to'])}/messages", {"content": d["text"][:2000]}).get("id")}

@register
class Telegram(Connector):
    id = "telegram"; name = "Telegram"; group = "Messaging"; blurb = "Messages to your bot, and replies."
    fields = ["token"]; secret_fields = ["token"]; docs = "core.telegram.org/bots#botfather"; draft_fields = ("to", "text")
    def _u(self, method): return f"{_b('telegram')}/bot{self.c['token']}/{method}"
    def _ok(self, r):
        if not r.get("ok"): raise ConnectorError("Telegram: " + str(r.get("description", "request failed")))
        return r["result"]
    def check(self): self.need("token"); return bool(self._ok(http("GET", self._u("getMe")))["id"])
    def search(self, query, limit=10):
        self.need("token"); out = []
        for u in self._ok(http("GET", self._u("getUpdates") + "?limit=100")):
            m = u.get("message") or u.get("channel_post")
            if not m or not m.get("text"): continue
            ch = m["chat"]; who = ch.get("title") or " ".join(filter(None, [ch.get("first_name"), ch.get("last_name")])) or ch.get("username") or str(ch["id"])
            out.append({"id": f"{ch['id']}:{m['message_id']}", "title": who, "snippet": _txt(m["text"]), "from": who, "at": m.get("date"), "chat_id": ch["id"], "text": m["text"]})
        return [x for x in out if not query or query.lower() in (x["title"] + x["snippet"]).lower()][-limit:]
    def read(self, item_id):
        for x in self.search("", 100):
            if x["id"] == item_id: return x
        raise ConnectorError("message not found (Telegram keeps updates for 24 hours)", 404)
    def send(self, d):
        self.need("token"); to, _, reply = d["to"].partition(":")
        return {"id": self._ok(http("POST", self._u("sendMessage"), None, dict({"chat_id": to, "text": d["text"]}, **({"reply_to_message_id": int(reply)} if reply.isdigit() else {}))))["message_id"]}

# ---------- Files and docs ----------
@register
class GoogleDrive(Connector):
    id = "gdrive"; name = "Google Drive"; group = "Files"; auth = "oauth"; blurb = "Find and read docs, sheets and files."
    fields = ["client_id", "client_secret"]; secret_fields = ["client_secret"]; docs = "developers.google.com/drive/api"
    oauth = G_OAUTH(["https://www.googleapis.com/auth/drive.readonly"]); can = ("search", "read")
    def search(self, query, limit=10):
        self.need("access_token")
        qq = f"fullText contains '{query.replace(chr(39), '')}' and trashed=false" if query else "trashed=false"
        r = http("GET", f"{_b('gdrive')}/files?pageSize={limit}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q={q(qq)}", self.tok())
        return [{"id": f["id"], "title": f["name"], "snippet": f.get("mimeType", ""), "url": f.get("webViewLink"), "at": f.get("modifiedTime")} for f in r.get("files", [])]
    def read(self, item_id):
        self.need("access_token")
        meta = http("GET", f"{_b('gdrive')}/files/{q(item_id)}?fields=id,name,mimeType", self.tok())
        mt = meta.get("mimeType", "")
        url = (f"{_b('gdrive')}/files/{q(item_id)}/export?mimeType=" + q("text/csv" if "spreadsheet" in mt else "text/plain")) if mt.startswith("application/vnd.google-apps") else f"{_b('gdrive')}/files/{q(item_id)}?alt=media"
        r = http("GET", url, self.tok())
        return {"id": item_id, "title": meta.get("name"), "text": str(r.get("text") if "text" in r else r)[:20000]}

@register
class Notion(Connector):
    id = "notion"; name = "Notion"; group = "Docs"; blurb = "Search pages and add notes."
    fields = ["token"]; secret_fields = ["token"]; docs = "www.notion.so/my-integrations"; draft_fields = ("to", "subject", "text")   # to = parent page id
    H = {"Notion-Version": "2022-06-28"}
    def search(self, query, limit=10):
        self.need("token")
        r = http("POST", f"{_b('notion')}/search", self.tok(), {"query": query, "page_size": limit}, headers=self.H)
        def title(p):
            for v in (p.get("properties") or {}).values():
                if v.get("type") == "title": return "".join(t.get("plain_text", "") for t in v["title"]) or "Untitled"
            return "".join(t.get("plain_text", "") for t in p.get("title", [])) or "Untitled"
        return [{"id": p["id"], "title": title(p), "snippet": p.get("object", ""), "url": p.get("url"), "at": p.get("last_edited_time")} for p in r.get("results", [])]
    def read(self, item_id):
        self.need("token")
        r = http("GET", f"{_b('notion')}/blocks/{q(item_id)}/children?page_size=100", self.tok(), headers=self.H)
        lines = []
        for b in r.get("results", []):
            v = b.get(b.get("type"), {}) or {}
            lines.append("".join(t.get("plain_text", "") for t in v.get("rich_text", [])))
        return {"id": item_id, "text": "\n".join(l for l in lines if l)[:20000]}
    def send(self, d):
        self.need("token")
        body = {"parent": {"page_id": d["to"]}, "properties": {"title": {"title": [{"text": {"content": d.get("subject") or "Note from Free way"}}]}},
                "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": p[:2000]}}]}} for p in d["text"].split("\n\n")[:50]]}
        r = http("POST", f"{_b('notion')}/pages", self.tok(), body, headers=self.H)
        return {"id": r.get("id"), "url": r.get("url")}

# ---------- Work tools ----------
@register
class GitHub(Connector):
    id = "github"; name = "GitHub"; group = "Dev"; blurb = "Issues and pull requests: search, read, comment."
    fields = ["token"]; secret_fields = ["token"]; docs = "github.com/settings/personal-access-tokens"; draft_fields = ("to", "text")   # to = owner/repo#123
    def search(self, query, limit=10):
        self.need("token")
        r = http("GET", f"{_b('github')}/search/issues?per_page={limit}&q={q(query or 'is:open involves:@me')}", self.tok(), scheme="token")
        return [{"id": re.sub(r"^https://api\.github\.com/repos/", "", i["url"]).replace("/issues/", "#").replace("/pulls/", "#"), "title": i["title"],
                 "snippet": f"{'PR' if i.get('pull_request') else 'Issue'} · {i.get('state')} · {i.get('comments', 0)} comments", "url": i.get("html_url"), "at": i.get("updated_at")} for i in r.get("items", [])]
    def _parse(self, ref):
        m = re.fullmatch(r"([\w.-]+/[\w.-]+)#(\d+)", ref or "")
        if not m: raise ConnectorError("use owner/repo#number")
        return m.group(1), m.group(2)
    def read(self, item_id):
        self.need("token"); repo, n = self._parse(item_id)
        i = http("GET", f"{_b('github')}/repos/{repo}/issues/{n}", self.tok(), scheme="token")
        cs = http("GET", f"{_b('github')}/repos/{repo}/issues/{n}/comments?per_page=30", self.tok(), scheme="token")
        return {"id": item_id, "title": i.get("title"), "text": i.get("body") or "", "url": i.get("html_url"), "comments": [{"from": (c.get("user") or {}).get("login"), "text": c.get("body")} for c in cs]}
    def validate_draft(self, d): d = super().validate_draft(d); self._parse(d["to"]); return d
    def send(self, d):
        self.need("token"); repo, n = self._parse(d["to"])
        r = http("POST", f"{_b('github')}/repos/{repo}/issues/{n}/comments", self.tok(), {"body": d["text"]}, scheme="token")
        return {"id": r.get("id"), "url": r.get("html_url")}

@register
class GoogleCalendar(Connector):
    id = "gcal"; name = "Google Calendar"; group = "Calendar"; auth = "oauth"; blurb = "Upcoming events, and new events you approve."
    fields = ["client_id", "client_secret"]; secret_fields = ["client_secret"]; docs = "developers.google.com/calendar/api"
    oauth = G_OAUTH(["https://www.googleapis.com/auth/calendar.events"]); draft_fields = ("subject", "start", "end", "text", "to")
    def search(self, query, limit=10):
        self.need("access_token")
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        r = http("GET", f"{_b('gcal')}/calendars/primary/events?maxResults={limit}&singleEvents=true&orderBy=startTime&timeMin={q(now)}" + (f"&q={q(query)}" if query else ""), self.tok())
        return [{"id": e["id"], "title": e.get("summary") or "(no title)", "snippet": _txt(e.get("description")), "at": (e.get("start") or {}).get("dateTime") or (e.get("start") or {}).get("date"), "url": e.get("htmlLink")} for e in r.get("items", [])]
    def read(self, item_id):
        self.need("access_token"); e = http("GET", f"{_b('gcal')}/calendars/primary/events/{q(item_id)}", self.tok())
        return {"id": item_id, "title": e.get("summary"), "text": e.get("description") or "", "start": e.get("start"), "end": e.get("end"), "attendees": [a.get("email") for a in e.get("attendees", [])]}
    def validate_draft(self, d):
        out = {k: str(d.get(k) or "")[:5000] for k in self.draft_fields}
        if not out["subject"].strip(): raise ConnectorError("give the event a title")
        for k in ("start", "end"):
            if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?([+-]\d\d:\d\d|Z)", out[k]): raise ConnectorError(f"{k} must be a date and time with a zone, like 2026-10-22T10:00+07:00")
        return out
    def send(self, d):
        self.need("access_token")
        body = {"summary": d["subject"], "description": d.get("text") or "", "start": {"dateTime": d["start"]}, "end": {"dateTime": d["end"]},
                "attendees": [{"email": a.strip()} for a in (d.get("to") or "").split(",") if a.strip()]}
        r = http("POST", f"{_b('gcal')}/calendars/primary/events", self.tok(), body)
        return {"id": r.get("id"), "url": r.get("htmlLink")}

@register
class Linear(Connector):
    id = "linear"; name = "Linear"; group = "Dev"; blurb = "Issues: search, read, create."
    fields = ["token"]; secret_fields = ["token"]; docs = "linear.app/settings/account/security"; draft_fields = ("to", "subject", "text")   # to = team id
    def _gql(self, query, variables=None):
        r = http("POST", f"{_b('linear')}/graphql", None, {"query": query, "variables": variables or {}}, headers={"Authorization": self.tok()})
        if r.get("errors"): raise ConnectorError("Linear: " + r["errors"][0].get("message", "error"))
        return r["data"]
    def search(self, query, limit=10):
        self.need("token")
        d = self._gql("query($q:String!,$n:Int){searchIssues(term:$q,first:$n){nodes{id identifier title url state{name} updatedAt}}}", {"q": query or "", "n": limit})
        return [{"id": i["identifier"], "title": f"{i['identifier']} {i['title']}", "snippet": (i.get("state") or {}).get("name", ""), "url": i.get("url"), "at": i.get("updatedAt")} for i in d["searchIssues"]["nodes"]]
    def read(self, item_id):
        self.need("token"); i = self._gql("query($id:String!){issue(id:$id){identifier title description url comments{nodes{body user{name}}}}}", {"id": item_id})["issue"]
        return {"id": item_id, "title": i["title"], "text": i.get("description") or "", "url": i.get("url"), "comments": [{"from": (c.get("user") or {}).get("name"), "text": c["body"]} for c in i["comments"]["nodes"]]}
    def send(self, d):
        self.need("token")
        r = self._gql("mutation($t:String!,$ti:String!,$de:String){issueCreate(input:{teamId:$t,title:$ti,description:$de}){success issue{identifier url}}}", {"t": d["to"], "ti": d.get("subject") or d["text"][:80], "de": d["text"]})
        iss = r["issueCreate"]["issue"]; return {"id": iss["identifier"], "url": iss["url"]}

@register
class Jira(Connector):
    id = "jira"; name = "Jira"; group = "Dev"; blurb = "Search with JQL, read and comment on issues."
    fields = ["site", "email", "token"]; secret_fields = ["token"]; docs = "id.atlassian.com/manage-profile/security/api-tokens"; draft_fields = ("to", "text")   # to = issue key
    def _base(self):
        site = self.c.get("site", "").strip().rstrip("/")
        if not re.fullmatch(r"https://[\w.-]+\.atlassian\.net", site) and not BASES.get("jira"): raise ConnectorError("site must look like https://yourteam.atlassian.net")
        return (BASES.get("jira") or site) + "/rest/api/3"
    def _h(self, m, path, body=None):
        basic = base64.b64encode(f"{self.c['email']}:{self.c['token']}".encode()).decode()
        return http(m, self._base() + path, basic, body, scheme="Basic")
    def search(self, query, limit=10):
        self.need("site", "email", "token")
        jql = query if any(k in query for k in ("=", "~", " ORDER BY")) else (f'text ~ "{query}" ORDER BY updated DESC' if query else "assignee = currentUser() ORDER BY updated DESC")
        r = self._h("POST", "/search/jql", {"jql": jql, "maxResults": limit, "fields": ["summary", "status", "updated"]})
        return [{"id": i["key"], "title": f"{i['key']} {i['fields'].get('summary', '')}", "snippet": ((i["fields"].get("status") or {}).get("name") or ""), "at": i["fields"].get("updated")} for i in r.get("issues", [])]
    def read(self, item_id):
        self.need("site", "email", "token")
        i = self._h("GET", f"/issue/{q(item_id)}?fields=summary,description,comment")
        def adf(n): return n.get("text", "") + "".join(adf(c) for c in n.get("content", []) or []) + ("\n" if n.get("type") == "paragraph" else "")
        f = i.get("fields", {})
        return {"id": item_id, "title": f.get("summary"), "text": adf(f.get("description") or {})[:20000], "comments": [{"from": (c.get("author") or {}).get("displayName"), "text": adf(c.get("body") or {})} for c in (f.get("comment") or {}).get("comments", [])]}
    def send(self, d):
        self.need("site", "email", "token")
        body = {"body": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in d["text"].split("\n\n") if p.strip()]}}
        return {"id": self._h("POST", f"/issue/{q(d['to'])}/comment", body).get("id")}
