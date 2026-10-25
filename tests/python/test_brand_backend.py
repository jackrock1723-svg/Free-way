"""User-visible backend strings use the Free way name; the package stays `freecode`."""
import unittest
from pathlib import Path

PKG = Path(__file__).resolve().parents[2] / "freecode"


class BackendBrandTests(unittest.TestCase):
    def test_no_old_product_name_in_backend_strings(self):
        hits = [p.name for p in PKG.rglob("*.py") if "Freecode" in p.read_text(encoding="utf-8")]
        self.assertEqual(hits, [])

    def test_auto_model_and_identity_use_free_way(self):
        from freecode import catalog, research
        names = [b.name for b in catalog.FREE + catalog.PREMIUM]
        self.assertIn("Free way Auto", names)
        self.assertNotIn("freecode.ai", Path(research.__file__).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()