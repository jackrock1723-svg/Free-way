"""Semantic (embedding) search layered on the local code index.

* ``Embedder`` is pluggable. The default ``HashEmbedder`` is free, offline and deterministic: identifier-aware
  tokens + a small code-concept synonym map + character trigrams, hashed into a fixed-size unit vector.
  ``OllamaEmbedder`` uses a free local Ollama model when FW_EMBEDDER=ollama (never a paid API).
* ``SqliteVectorStore`` keeps vectors next to the FTS index (local default).
* ``PgVectorStore`` targets Postgres/Supabase with pgvector (see migrations/002_pgvector.sql).
* ``hybrid_search`` blends keyword (FTS5) and vector scores.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import struct
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.request import Request, urlopen

DEFAULT_DIMS = 256
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9]*|\d+")
_CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")
STOPWORDS = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "it", "this", "that", "with", "be", "as", "at",
             "by", "from", "if", "else", "return", "def", "function", "const", "let", "var", "import", "export", "self", "true",
             "false", "none", "null", "class", "new", "my", "me", "i", "we", "you", "how", "do", "does", "where", "what"}
# Code-concept synonyms: map many surface words onto one concept so "sign in" finds login code.
CONCEPTS = {
    "login": ("login", "signin", "sign", "logon", "authenticate", "authentication", "auth", "oauth", "session", "password", "credential"),
    "logout": ("logout", "signout", "logoff"),
    "database": ("database", "db", "sql", "sqlite", "postgres", "postgresql", "mysql", "query", "table", "orm", "migration", "schema"),
    "delete": ("delete", "remove", "erase", "destroy", "drop", "purge"),
    "create": ("create", "add", "insert", "new", "make", "register"),
    "update": ("update", "edit", "modify", "change", "patch", "save"),
    "payment": ("payment", "pay", "charge", "billing", "invoice", "checkout", "stripe", "price", "card", "subscription"),
    "error": ("error", "exception", "fail", "failure", "crash", "bug", "raise", "throw", "catch"),
    "test": ("test", "tests", "spec", "assert", "expect", "pytest", "jest", "mock"),
    "style": ("style", "css", "theme", "color", "colour", "font", "layout", "design"),
    "network": ("http", "fetch", "request", "api", "endpoint", "route", "url", "client"),
    "file": ("file", "path", "read", "write", "upload", "download", "disk"),
    "user": ("user", "users", "account", "profile", "member"),
    "search": ("search", "find", "lookup", "index", "query"),
    "email": ("email", "mail", "smtp", "inbox"),
}
_CONCEPT_OF = {w: c for c, words in CONCEPTS.items() for w in words}


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > len(suffix) + 2 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def tokens(text: str) -> list[str]:
    out = []
    for word in _WORD.findall(text or ""):
        parts = [p for p in _CAMEL.findall(word)] or [word]
        for part in ([word] + parts if len(parts) > 1 else parts):
            low = part.lower()
            if len(low) < 2 or low in STOPWORDS:
                continue
            out.append(_stem(low))
    return out


class Embedder:
    name = "base"
    dims = DEFAULT_DIMS

    def embed(self, texts: list[str]) -> list[list[float]]:  # pragma: no cover - interface
        raise NotImplementedError


class HashEmbedder(Embedder):
    """Free, offline, deterministic embeddings (feature hashing). Good enough for code navigation; swap for a model later."""

    def __init__(self, dims: int = DEFAULT_DIMS):
        self.dims = int(dims)
        self.name = f"hash-v1-{self.dims}"

    def _add(self, vec, feature: str, weight: float):
        h = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h[:4], "little") % self.dims
        vec[idx] += weight if h[4] & 1 else -weight

    def embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dims
        for tok in tokens(text):
            self._add(vec, "w:" + tok, 1.0)
            concept = _CONCEPT_OF.get(tok) or _CONCEPT_OF.get(tok + "s")
            if concept:
                self._add(vec, "c:" + concept, 1.5)
            if len(tok) > 4:
                for i in range(len(tok) - 2):
                    self._add(vec, "g:" + tok[i:i + 3], 0.25)
        norm = math.sqrt(sum(v * v for v in vec))
        return [v / norm for v in vec] if norm else vec

    def embed(self, texts):
        return [self.embed_one(t) for t in texts]


class OllamaEmbedder(Embedder):
    """Free local model through Ollama (http://localhost:11434). Not used unless FW_EMBEDDER=ollama."""

    def __init__(self, model: str = "nomic-embed-text", url: str = "http://127.0.0.1:11434", dims: int = 768, timeout: float = 30):
        self.model, self.url, self.dims, self.timeout = model, url.rstrip("/"), int(dims), timeout
        self.name = f"ollama-{model}"

    def embed(self, texts):
        out = []
        for text in texts:
            req = Request(self.url + "/api/embeddings", data=json.dumps({"model": self.model, "prompt": text[:8000]}).encode(),
                          headers={"Content-Type": "application/json"}, method="POST")
            with urlopen(req, timeout=self.timeout) as r:
                vec = [float(x) for x in json.loads(r.read())["embedding"]]
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


def make_embedder(environ=None) -> tuple[Embedder, str | None]:
    import os
    environ = os.environ if environ is None else environ
    kind = (environ.get("FW_EMBEDDER") or "hash").strip().lower()
    if kind == "hash":
        return HashEmbedder(), None
    if kind == "ollama":
        try:
            dims = int(environ.get("FW_EMBED_DIMS") or 768)
        except ValueError:
            dims = 768
        url = environ.get("FW_OLLAMA_URL") or "http://127.0.0.1:11434"
        if not url.startswith(("http://127.0.0.1", "http://localhost")):
            return HashEmbedder(), "FW_OLLAMA_URL must point at this computer; using the offline hash embedder."
        return OllamaEmbedder(environ.get("FW_EMBED_MODEL") or "nomic-embed-text", url, dims), None
    return HashEmbedder(), f"Unknown FW_EMBEDDER '{kind[:20]}'; using the offline hash embedder."


def _pack(vec) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack(blob: bytes) -> list[float]:
    return list(struct.unpack(f"<{len(blob) // 4}f", blob))


def _preview(text: str) -> str:
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()[:200]
    return ""


def _doc(path: str, text: str) -> str:
    # The file path is part of the meaning ("auth/login.py"), so embed it with the chunk.
    return path.replace("/", " ").replace(".", " ") + "\n" + text


class SqliteVectorStore:
    """Local vector store: brute-force cosine over float32 blobs. Fine for project-sized indexes."""

    def __init__(self, db_path, embedder: Embedder | None = None):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.embedder = embedder or HashEmbedder()
        self._lock = threading.Lock()
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS vec_chunks (path TEXT, start_line INTEGER, model TEXT, dims INTEGER, preview TEXT, vector BLOB)")
            db.execute("CREATE INDEX IF NOT EXISTS vec_chunks_path ON vec_chunks(path)")

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def upsert(self, path: str, chunks) -> None:
        chunks = [(int(s), t) for s, t in chunks if t and t.strip()]
        vectors = self.embedder.embed([_doc(path, t) for _, t in chunks]) if chunks else []
        with self._lock, self._db() as db:
            db.execute("DELETE FROM vec_chunks WHERE path=?", (path,))
            db.executemany("INSERT INTO vec_chunks VALUES (?,?,?,?,?,?)",
                           [(path, s, self.embedder.name, len(v), _preview(t), _pack(v)) for (s, t), v in zip(chunks, vectors)])

    def remove(self, path: str) -> None:
        with self._lock, self._db() as db:
            db.execute("DELETE FROM vec_chunks WHERE path=?", (path,))

    def count(self) -> int:
        with self._db() as db:
            return db.execute("SELECT COUNT(*) FROM vec_chunks WHERE model=?", (self.embedder.name,)).fetchone()[0]

    def search(self, query: str, limit: int = 10) -> list[dict]:
        if not (query or "").strip():
            return []
        q = self.embedder.embed([query])[0]
        hits = []
        with self._db() as db:
            for path, start, preview, blob in db.execute("SELECT path, start_line, preview, vector FROM vec_chunks WHERE model=?", (self.embedder.name,)):
                v = _unpack(blob)
                if len(v) != len(q):
                    continue
                score = sum(a * b for a, b in zip(q, v))
                if score > 0:
                    hits.append({"path": path, "line": int(start), "text": preview, "score": round(score, 4)})
        hits.sort(key=lambda h: (-h["score"], h["path"], h["line"]))
        return hits[: max(1, min(int(limit), 100))]


class PgVectorStore:
    """pgvector store for Postgres/Supabase. ``connect`` returns a DB-API connection (psycopg)."""

    def __init__(self, connect, embedder: Embedder | None = None, *, owner_id: str = "owner", project_id: str = "demo", clock=time.time):
        self.connect, self.embedder, self.owner_id, self.project_id, self.clock = connect, embedder or HashEmbedder(), owner_id, project_id, clock

    @staticmethod
    def literal(vec) -> str:
        return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"

    def _run(self, statements):
        db = self.connect()
        try:
            cur = db.cursor(); rows = None
            for sql, params in statements:
                cur.execute(sql, params)
                if sql.lstrip().upper().startswith("SELECT"):
                    rows = cur.fetchall()
            db.commit(); return rows
        except Exception:
            db.rollback(); raise
        finally:
            db.close()

    def upsert(self, path: str, chunks) -> None:
        chunks = [(int(s), t) for s, t in chunks if t and t.strip()]
        vectors = self.embedder.embed([_doc(path, t) for _, t in chunks]) if chunks else []
        key = (self.owner_id, self.project_id, path)
        stmts = [("DELETE FROM code_chunks WHERE owner_id = %s AND project_id = %s AND path = %s", key)]
        for (start, text), vec in zip(chunks, vectors):
            stmts.append(("INSERT INTO code_chunks (owner_id, project_id, path, start_line, model, content_sha, preview, embedding, updated_at) "
                          "VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s)",
                          key + (start, self.embedder.name, hashlib.sha1(text.encode()).hexdigest(), _preview(text), self.literal(vec), self.clock())))
        self._run(stmts)

    def remove(self, path: str) -> None:
        self._run([("DELETE FROM code_chunks WHERE owner_id = %s AND project_id = %s AND path = %s", (self.owner_id, self.project_id, path))])

    def search(self, query: str, limit: int = 10) -> list[dict]:
        if not (query or "").strip():
            return []
        q = self.literal(self.embedder.embed([query])[0])
        rows = self._run([("SELECT path, start_line, preview, 1 - (embedding <=> %s::vector) AS score FROM code_chunks "
                           "WHERE owner_id = %s AND project_id = %s AND model = %s ORDER BY embedding <=> %s::vector LIMIT %s",
                           (q, self.owner_id, self.project_id, self.embedder.name, q, max(1, min(int(limit), 100))))]) or []
        return [{"path": r[0], "line": int(r[1]), "text": r[2], "score": round(float(r[3]), 4)} for r in rows]


def backfill(index, store) -> int:
    """Embed every chunk already in the FTS index (used when vectors are added to an existing index)."""
    by_path: dict[str, list] = {}
    with index._connect() as db:
        for path, start, text in db.execute("SELECT path, start_line, text FROM chunks"):
            by_path.setdefault(path, []).append((int(start), text))
    for path, chunks in by_path.items():
        store.upsert(path, sorted(chunks))
    return len(by_path)


def hybrid_search(index, store, query: str, limit: int = 10, vector_weight: float = 0.65) -> list[dict]:
    """Blend vector similarity with normalised keyword scores; one row per (path, nearby line)."""
    limit = max(1, min(int(limit), 50))
    vec_hits = store.search(query, limit * 3)
    # Keyword pass without filler words: "where" would otherwise match SQL WHERE clauses.
    keywords = " ".join(w for w in re.findall(r"[A-Za-z0-9_]+", query or "") if w.lower() not in STOPWORDS)
    kw_hits = [h for h in index.search(keywords, limit * 3) if not h.get("symbol")] if keywords else []
    top_kw = max((h["score"] for h in kw_hits), default=0) or 1.0
    merged: dict[tuple, dict] = {}
    for h in vec_hits:
        key = (h["path"], h["line"])
        merged[key] = dict(h, vector=h["score"], keyword=0.0)
    for h in kw_hits:
        bucket = None
        for (path, line) in merged:
            if path == h["path"] and line <= h["line"] < line + 40:
                bucket = (path, line); break
        norm = max(0.0, h["score"]) / top_kw
        if bucket:
            merged[bucket]["keyword"] = max(merged[bucket]["keyword"], norm)
            merged[bucket]["text"] = h["text"] or merged[bucket]["text"]
        else:
            merged[(h["path"], h["line"])] = dict(h, vector=0.0, keyword=norm)
    for item in merged.values():
        item["score"] = round(vector_weight * item["vector"] + (1 - vector_weight) * item["keyword"], 4)
    return sorted(merged.values(), key=lambda h: (-h["score"], h["path"], h["line"]))[:limit]
