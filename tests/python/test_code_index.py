"""Local code index: symbols + FTS5 chunks, incremental refresh, exclusions, API, Buffy use."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from freecode import buffy
from freecode.code_index import CodeIndex, list_files


def write(root: Path, rel: str, text: str | bytes) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    (path.write_bytes if isinstance(text, bytes) else lambda t: path.write_text(t, encoding="utf-8"))(text)


class CodeIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="freeway-index-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        write(self.root, "src/billing.py", "def charge_invoice(amount):\n    return amount\n\nclass InvoiceStore:\n    pass\n")
        write(self.root, "src/ui.js", "export function renderPricing() {\n  return 'pricing table';\n}\n")
        write(self.root, ".env", "INVOICE_KEY=never-index\n")
        write(self.root, "config/api_token.json", '{"invoice": "never-index"}')
        write(self.root, "assets/logo.png", b"\x89PNG\x00\x00invoice")
        write(self.root, "node_modules/lib/index.js", "function invoiceLib() {}\n")
        write(self.root, "notes/blob.txt", "invoice\x00binary")
        self.index = CodeIndex(Path(self.temp.name) / "idx" / "repo.sqlite")

    def test_refresh_indexes_text_and_skips_secret_binary_and_vendor_files(self):
        stats = self.index.refresh(self.root)
        self.assertEqual(stats["added"], 2)
        self.assertEqual(stats["skipped"], 1)  # notes/blob.txt has a NUL byte
        self.assertEqual(self.index.count(), 2)
        paths = {hit["path"] for hit in self.index.search("invoice", 50)}
        self.assertEqual(paths, {"src/billing.py"})

    def test_symbols_and_chunks_are_searchable(self):
        self.index.refresh(self.root)
        hits = self.index.search("charge_invoice")
        self.assertTrue(any(h.get("symbol") == "charge_invoice" and h["line"] == 1 for h in hits))
        pricing = self.index.search("pricing table")
        self.assertEqual(pricing[0]["path"], "src/ui.js")
        self.assertEqual(self.index.pick_files("pricing")[0], "src/ui.js")
        self.assertEqual(self.index.search("  "), [])

    def test_incremental_refresh_updates_changed_and_removes_deleted(self):
        self.index.refresh(self.root)
        second = self.index.refresh(self.root)
        self.assertEqual((second["added"], second["updated"], second["unchanged"]), (0, 0, 2))
        time.sleep(0.05)
        write(self.root, "src/ui.js", "export function renderCheckout() {}\n")
        os.utime(self.root / "src/ui.js", None)
        (self.root / "src/billing.py").rename(self.root / "src/billing.bak")
        third = self.index.refresh(self.root)
        self.assertEqual(third["updated"], 1)
        self.assertEqual(third["removed"], 1)
        self.assertEqual(self.index.search("renderPricing"), [])
        self.assertTrue(self.index.search("renderCheckout"))

    def test_git_ignored_files_are_excluded(self):
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        write(self.root, ".gitignore", "generated/\n")
        write(self.root, "generated/out.js", "function invoiceGenerated() {}\n")
        self.assertNotIn("generated/out.js", list_files(self.root))
        self.assertIn("src/billing.py", list_files(self.root))

    def test_buffy_agents_use_the_index(self):
        self.index.refresh(self.root)
        cmap = buffy.code_map(self.root)
        picked = buffy.file_picker("update the invoice charge", cmap, self.index)
        self.assertEqual(picked["files"][0], "src/billing.py")
        self.assertIn("code index", picked["summary"])
        searched = buffy.code_searcher(self.root, "invoice charge", cmap, self.index)
        self.assertTrue(searched["hits"][0].startswith("src/billing.py:"))
        self.assertIn("indexed", searched["summary"])


class CodeIndexApiTests(unittest.TestCase):
    def test_search_and_refresh_endpoints(self):
        from server_fixture import running_server
        with running_server() as (app, base_url):
            root = app.ws.project_dir("demo") if (app.ws.root / "projects" / "demo").exists() else app.ws.create_project("demo", "Demo")
            write(Path(root), "src/search_me.py", "def locate_widget():\n    return 'widget'\n")
            req = Request(f"{base_url}/api/projects/demo/index/refresh", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
            with urlopen(req, timeout=10) as response:
                stats = json.loads(response.read())
            self.assertGreaterEqual(stats["files"], 2)
            with urlopen(f"{base_url}/api/projects/demo/index/search?q=locate_widget", timeout=10) as response:
                body = json.loads(response.read())
            self.assertEqual(body["query"], "locate_widget")
            self.assertTrue(any(r["path"] == "src/search_me.py" for r in body["results"]))


if __name__ == "__main__":
    unittest.main()
