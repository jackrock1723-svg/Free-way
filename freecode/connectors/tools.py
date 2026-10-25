"""Agent tools over connectors. Agents may search, read and draft. There is deliberately no send tool:
a draft waits in the Drafts inbox until the person approves it."""
import json, re
from .base import REGISTRY, ConnectorError

TOOLS = [
    {"name": "connector_search", "description": "Search a connected app (mail, chat, files, issues).", "parameters": {"connector": "id", "query": "text"}},
    {"name": "connector_read", "description": "Read one item returned by connector_search.", "parameters": {"connector": "id", "id": "item id"}},
    {"name": "connector_draft", "description": "Prepare a message, comment, issue or event. It is NOT sent: the user must approve it.", "parameters": {"connector": "id", "fields": "object"}},
]
ALLOWED = {t["name"] for t in TOOLS}

def run_tool(store, name, args, agent=None):
    if name not in ALLOWED: raise ConnectorError("agents cannot send; drafts need the user's approval", 403)
    cid = (args or {}).get("connector")
    if cid not in REGISTRY: raise ConnectorError("unknown connector", 404)
    if name == "connector_search": return store.search(cid, args.get("query", ""), args.get("limit", 8))
    if name == "connector_read": return store.read(cid, args.get("id"))
    return store.draft(cid, args.get("fields") or {}, origin="agent", agent=agent)

MENTION = re.compile(r"(?<![\w@])@(" + "|".join(sorted(REGISTRY, key=len, reverse=True)) + r")\b", re.I)
def mentions(text): return list(dict.fromkeys(m.lower() for m in MENTION.findall(text or "")))

def context_for(store, text, limit=6):
    """For chat: '@gmail invoices from March' searches Gmail and returns a compact context block plus the items."""
    blocks, items = [], []
    for cid in mentions(text)[:3]:
        query = MENTION.sub("", text).strip()[:200]
        try: res = store.search(cid, query, limit)
        except ConnectorError as e: blocks.append(f"[{REGISTRY[cid].name}] could not search: {e}"); continue
        for r in res: items.append(dict(r, connector=cid))
        blocks.append(f"[{REGISTRY[cid].name} results for '{query}']\n" + "\n".join(f"- ({r.get('id')}) {r.get('title')}: {r.get('snippet', '')}" + (f" from {r['from']}" if r.get("from") else "") for r in res) or "(nothing found)")
    return "\n\n".join(blocks), items
