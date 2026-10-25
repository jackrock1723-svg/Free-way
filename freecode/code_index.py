"""Local code search index (SQLite FTS5): symbols + line chunks, incremental refresh.

No network, no paid services. Secret-looking, binary, oversized and git-ignored files are
skipped. The `vectors` table and `VectorBackend` hook are reserved so a pgvector (Supabase)
backend can add semantic search later without changing callers.
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import subprocess
import threading
from contextlib import contextmanager
from pathlib import Path

from .buffy import CODE_SUFFIXES, EXCLUDED_DIRS, SECRET_TOKENS, SYMBOL_PATTERNS

SCHEMA_VERSION = 1
TEXT_SUFFIXES = CODE_SUFFIXES | {".txt", ".sh", ".ps1", ".sql", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".c", ".h", ".cpp", ".cs", ".vue", ".svelte", ".scss"}
MAX_FILE_BYTES = 512_000
MAX_FILES = 5_000
CHUNK_LINES = 40
MAX_QUERY_TERMS = 8


class VectorBackend:
    """Embedding store hook. Implementations live in vector_index.py (SQLite locally, pgvector on Supabase)."""

    def upsert(self, path: str, chunks: list[tuple[int, str]]) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def search(self, query: str, limit: int) -> list[dict]:  # pragma: no cover - interface
        raise NotImplementedError


def _allowed(rel: str) -> bool:
    low = rel.lower()
    parts = low.split("/")
    if any(p in EXCLUDED_DIRS for p in parts[:-1]) or any(t in low for t in SECRET_TOKENS):
        return False
    return Path(low).suffix in TEXT_SUFFIXES


def list_files(root: Path) -> list[str]:
    """Tracked + untracked-but-not-ignored files when root is a git repo, else a bounded walk."""
    root = Path(root)
    rels: list[str] = []
    if (root / ".git").exists():
        try:
            r = subprocess.run(["git", "-c", f"safe.directory={root.as_posix()}", "ls-files", "-co", "--exclude-standard", "-z"],
                               cwd=root, capture_output=True, timeout=30, stdin=subprocess.DEVNULL)
            if r.returncode == 0:
                rels = [p for p in r.stdout.decode("utf-8", "replace").split("\0") if p]
        except (OSError, subprocess.TimeoutExpired):
            rels = []
    if not rels:
        for directory, subdirs, files in os.walk(root, followlinks=False):
            subdirs[:] = sorted(d for d in subdirs if d.lower() not in EXCLUDED_DIRS and not d.startswith(".git"))
            for name in sorted(files):
                rels.append((Path(directory) / name).relative_to(root).as_posix())
    out = []
    for rel in sorted(set(rels)):
        path = root / rel
        if _allowed(rel) and path.is_file() and not path.is_symlink():
            out.append(rel)
        if len(out) >= MAX_FILES:
            break
    return out


def _read_text(path: Path) -> str | None:
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return None
        raw = path.read_bytes()
    except OSError:
        return None
    if b"\0" in raw[:8192]:
        return None
    return raw.decode("utf-8", errors="replace")


def _symbols(rel: str, text: str) -> list[tuple[str, int]]:
    pattern = SYMBOL_PATTERNS.get(Path(rel).suffix.lower())
    if not pattern:
        return []
    found = []
    for match in pattern.finditer(text):
        name = next((g for g in match.groups() if g), None)
        if name:
            found.append((name, text.count("\n", 0, match.start()) + 1))
    return found[:500]


def _terms(query: str) -> list[str]:
    return [t for t in re.findall(r"[A-Za-z0-9_]{2,}", query or "")][:MAX_QUERY_TERMS]


class CodeIndex:
    def __init__(self, db_path, vectors: VectorBackend | None = None):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.vectors = vectors
        self._lock = threading.Lock()
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, mtime REAL, size INTEGER, sha1 TEXT);
                CREATE TABLE IF NOT EXISTS symbols (path TEXT, name TEXT, line INTEGER);
                CREATE INDEX IF NOT EXISTS symbols_name ON symbols(name);
                CREATE INDEX IF NOT EXISTS symbols_path ON symbols(path);
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(path UNINDEXED, start_line UNINDEXED, text, tokenize='unicode61 tokenchars ''_''');
                CREATE TABLE IF NOT EXISTS vectors (path TEXT, start_line INTEGER, model TEXT, dims INTEGER, vector BLOB);
            """)
            db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def refresh(self, root) -> dict:
        root = Path(root).resolve()
        stats = {"added": 0, "updated": 0, "removed": 0, "unchanged": 0, "skipped": 0}
        with self._lock, self._connect() as db:
            known = {row[0]: (row[1], row[2]) for row in db.execute("SELECT path, mtime, size FROM files")}
            current = list_files(root)
            for rel in current:
                path = root / rel
                try:
                    st = path.stat()
                except OSError:
                    continue
                if known.get(rel) == (st.st_mtime, st.st_size):
                    stats["unchanged"] += 1
                    continue
                text = _read_text(path)
                self._drop(db, rel)
                if text is None:
                    if self.vectors is not None and hasattr(self.vectors, "remove"):
                        self.vectors.remove(rel)
                    stats["skipped"] += 1
                    continue
                db.execute("INSERT INTO files VALUES (?,?,?,?)", (rel, st.st_mtime, st.st_size, hashlib.sha1(text.encode("utf-8")).hexdigest()))
                db.executemany("INSERT INTO symbols VALUES (?,?,?)", [(rel, n, ln) for n, ln in _symbols(rel, text)])
                lines = text.splitlines()
                chunks = [(i + 1, "\n".join(lines[i:i + CHUNK_LINES])) for i in range(0, max(len(lines), 1), CHUNK_LINES)]
                db.executemany("INSERT INTO chunks (path, start_line, text) VALUES (?,?,?)", [(rel, s, c) for s, c in chunks if c.strip()])
                if self.vectors is not None:
                    self.vectors.upsert(rel, chunks)
                stats["added" if rel not in known else "updated"] += 1
            for rel in set(known) - set(current):
                self._drop(db, rel)
                if self.vectors is not None and hasattr(self.vectors, "remove"):
                    self.vectors.remove(rel)
                stats["removed"] += 1
        stats["files"] = self.count()
        return stats

    @staticmethod
    def _drop(db, rel: str) -> None:
        db.execute("DELETE FROM files WHERE path=?", (rel,))
        db.execute("DELETE FROM symbols WHERE path=?", (rel,))
        db.execute("DELETE FROM chunks WHERE path=?", (rel,))

    def count(self) -> int:
        with self._connect() as db:
            return db.execute("SELECT COUNT(*) FROM files").fetchone()[0]

    def search(self, query: str, limit: int = 20) -> list[dict]:
        terms = _terms(query)
        if not terms:
            return []
        limit = max(1, min(int(limit), 100))
        results: list[dict] = []
        with self._connect() as db:
            for joiner in (" AND ", " OR "):
                expr = joiner.join('"' + t.replace('"', '') + '"' for t in terms)
                rows = db.execute("SELECT path, start_line, text, bm25(chunks) FROM chunks WHERE chunks MATCH ? ORDER BY bm25(chunks) LIMIT ?", (expr, limit)).fetchall()
                if rows:
                    break
            low = [t.lower() for t in terms]
            for path, start, text, score in rows:
                line_no, line_text = int(start), ""
                for offset, line in enumerate(text.splitlines()):
                    if any(t in line.lower() for t in low):
                        line_no, line_text = int(start) + offset, line.strip()
                        break
                results.append({"path": path, "line": line_no, "text": line_text[:200], "score": round(-float(score), 4)})
            for name, path, line in db.execute(
                    "SELECT name, path, line FROM symbols WHERE " + " OR ".join("lower(name) LIKE ?" for _ in low) + " LIMIT ?",
                    [f"%{t}%" for t in low] + [limit]):
                results.append({"path": path, "line": line, "text": f"symbol {name}", "score": 10.0, "symbol": name})
        results.sort(key=lambda r: -r["score"])
        return results[:limit]

    def pick_files(self, query: str, limit: int = 6) -> list[str]:
        scores: dict[str, float] = {}
        for hit in self.search(query, 50):
            scores[hit["path"]] = scores.get(hit["path"], 0.0) + hit["score"]
        return [p for p, _ in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]
