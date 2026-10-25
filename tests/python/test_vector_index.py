"""Step 9: offline embedding search layered on the code index, pgvector adapter SQL and migration."""
from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path
from urllib.request import urlopen

from freecode import vector_index as vi
from freecode.code_index import CodeIndex

ROOT = Path(__file__).resolve().parents[2]


def make_project(root: Path) -> Path:
    (root / "src").mkdir(parents=True)
    (root / "src" / "auth.py").write_text("def login_user(email, password):\n    session = create_session(email)\n    return session\n", encoding="utf-8")
    (root / "src" / "billing.py").write_text("def charge_card(amount):\n    return stripe_client.charge(amount)\n", encoding="utf-8")
    (root / "src" / "theme.css").write_text(".button { color: pink; font-weight: bold }\n", encoding="utf-8")
    (root / "src" / "storage.js").write_text("export function removeRecord(id) { return db.query('DELETE FROM items WHERE id = ?', [id]); }\n", encoding="utf-8")
    return root


class EmbedderTests(unittest.TestCase):
    def test_hash_embedder_is_deterministic_unit_length_and_offline(self):
        e = vi.HashEmbedder()
        a, b = e.embed(["def loginUser(): pass", "def loginUser(): pass"])
        self.assertEqual(a, b)
        self.assertEqual(len(a), 256)
        self.assertAlmostEqual(math.sqrt(sum(x * x for x in a)), 1.0, places=5)
        self.assertEqual(e.embed_one(""), [0.0] * 256)

    def test_tokens_split_identifiers_and_drop_stopwords(self):
        self.assertEqual(vi.tokens("getUserName login_user the"), ["getusername", "get", "user", "name", "login", "user"])

    def test_make_embedder_selection(self):
        self.assertIsInstance(vi.make_embedder({})[0], vi.HashEmbedder)
        e, warning = vi.make_embedder({"FW_EMBEDDER": "ollama", "FW_EMBED_MODEL": "nomic-embed-text"})
        self.assertIsInstance(e, vi.OllamaEmbedder)
        self.assertIsNone(warning)
        e, warning = vi.make_embedder({"FW_EMBEDDER": "ollama", "FW_OLLAMA_URL": "https://paid.example.com"})
        self.assertIsInstance(e, vi.HashEmbedder)
        self.assertIn("this computer", warning)
        self.assertIn("Unknown", vi.make_embedder({"FW_EMBEDDER": "mystery"})[1])


class SemanticSearchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.root = make_project(base / "proj")
        self.store = vi.SqliteVectorStore(base / "idx" / "v.sqlite")
        self.index = CodeIndex(base / "idx" / "i.sqlite", vectors=self.store)
        self.index.refresh(self.root)

    def test_concept_queries_find_code_without_shared_keywords(self):
        self.assertNotIn("src/auth.py", {h["path"] for h in self.index.search("people sign")})  # no shared keywords
        self.assertEqual(self.store.search("where do people sign in")[0]["path"], "src/auth.py")
        self.assertEqual(self.store.search("take a payment")[0]["path"], "src/billing.py")
        self.assertEqual(self.store.search("erase an entry from the database")[0]["path"], "src/storage.js")
        self.assertEqual(self.store.search("   "), [])

    def test_hybrid_search_blends_keyword_and_vector(self):
        hits = vi.hybrid_search(self.index, self.store, "charge_card amount", 5)
        self.assertEqual(hits[0]["path"], "src/billing.py")
        self.assertGreater(hits[0]["keyword"], 0)
        self.assertGreater(hits[0]["vector"], 0)
        self.assertEqual(vi.hybrid_search(self.index, self.store, "login", 5)[0]["path"], "src/auth.py")
        self.assertEqual(vi.hybrid_search(self.index, self.store, "where do people sign in", 5)[0]["path"], "src/auth.py")

    def test_vectors_follow_refresh_and_backfill(self):
        (self.root / "src" / "billing.py").unlink()
        self.index.refresh(self.root)
        self.assertNotIn("src/billing.py", {h["path"] for h in self.store.search("take a payment", 10)})
        fresh = vi.SqliteVectorStore(Path(self.tmp.name) / "idx" / "v2.sqlite")
        self.assertEqual(fresh.count(), 0)
        self.assertEqual(vi.backfill(self.index, fresh), 3)
        self.assertEqual(fresh.search("sign in")[0]["path"], "src/auth.py")


class FakeCursor:
    def __init__(self, log, rows):
        self.log, self.rows = log, rows

    def execute(self, sql, params=()):
        self.log.append((sql, tuple(params)))

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, log, rows):
        self.log, self.rows, self.committed = log, rows, False

    def cursor(self):
        return FakeCursor(self.log, self.rows)

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def close(self):
        pass


class PgVectorTests(unittest.TestCase):
    def test_pgvector_sql_is_parameterised_and_scoped(self):
        log = []
        rows = [("src/auth.py", 1, "def login_user(email, password):", 0.91)]
        store = vi.PgVectorStore(lambda: FakeConnection(log, rows), owner_id="u_abc", project_id="shop", clock=lambda: 1.0)
        store.upsert("src/auth.py", [(1, "def login_user(email, password):\n    pass")])
        delete_sql, delete_params = log[0]
        self.assertIn("DELETE FROM code_chunks", delete_sql)
        self.assertEqual(delete_params, ("u_abc", "shop", "src/auth.py"))
        insert_sql, insert_params = log[1]
        self.assertIn("%s::vector", insert_sql)
        self.assertTrue(insert_params[7].startswith("[") and insert_params[7].count(",") == 255)
        results = store.search("sign in")
        search_sql, search_params = log[-1]
        self.assertIn("<=>", search_sql)
        self.assertIn("owner_id = %s AND project_id = %s", search_sql)
        self.assertEqual(search_params[1:3], ("u_abc", "shop"))
        self.assertEqual(results, [{"path": "src/auth.py", "line": 1, "text": "def login_user(email, password):", "score": 0.91}])
        for sql, _ in log:
            self.assertNotIn("login_user", sql)       # values are parameters, never inlined

    def test_migration_creates_pgvector_table_index_and_rls(self):
        sql = (ROOT / "migrations" / "002_pgvector.sql").read_text(encoding="utf-8").lower()
        self.assertIn("create extension if not exists vector;", sql)
        self.assertIn("embedding   vector(256) not null", sql)
        self.assertIn("using hnsw (embedding vector_cosine_ops)", sql)
        self.assertIn("alter table code_chunks enable row level security;", sql)
        self.assertEqual(vi.HashEmbedder().dims, 256)


class SemanticEndpointTests(unittest.TestCase):
    def test_semantic_endpoint(self):
        from server_fixture import running_server
        with running_server() as (app, base):
            make_project(app.ws.project_dir("demo") / "semantic-demo")
            with urlopen(base + "/api/projects/demo/index/semantic?q=where%20do%20people%20sign%20in&limit=3", timeout=30) as r:
                body = json.loads(r.read())
            self.assertEqual(body["embedder"], "hash-v1-256")
            self.assertEqual(body["results"][0]["path"], "semantic-demo/src/auth.py")


if __name__ == "__main__":
    unittest.main()
