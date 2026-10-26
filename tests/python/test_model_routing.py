"""The model the user picks is the one asked; a fallback or a missing key is reported, never hidden."""
import unittest
import server_fixture  # noqa: F401
from freecode import catalog, research
from freecode.providers import Router


class Fake:
    def __init__(self): self.calls = []
    def complete(self, model, messages, key=None, **kw):
        self.calls.append(model); return "ok"


class CapturingRouter:
    def __init__(self): self.asked = None
    def complete(self, brand, messages, **kw):
        self.asked = brand; return "ok", {"brand": brand, "provider": "nim", "model": "m", "switched": 0}


class ChatKeepsChosenModel(unittest.TestCase):
    def test_short_first_message_keeps_the_picked_model(self):
        for brand in ("forge", "atlas", "craft", "flux"):
            r = CapturingRouter()
            research.answer(r, brand, [{"role": "user", "content": "explain closures in javascript"}], "chat")
            self.assertEqual(r.asked, brand)

    def test_auto_may_still_use_the_fast_model(self):
        r = CapturingRouter()
        research.answer(r, "auto", [{"role": "user", "content": "explain closures in javascript"}], "chat")
        self.assertEqual(r.asked, "lite")


class RouteReportsFallback(unittest.TestCase):
    def test_picked_model_answers_without_fallback(self):
        nim = Fake(); router = Router(keys={"nim": "k"}, providers={"nim": nim, "openrouter": Fake()})
        _, route = router.complete("forge", [{"role": "user", "content": "x"}])
        self.assertEqual((route["brand"], route["name"], route["fallback"], route["requested"]), ("forge", "GLM 5.3", False, "forge"))

    def test_missing_key_falls_back_and_says_so(self):
        router = Router(keys={"nim": "k"}, providers={"nim": Fake(), "openrouter": Fake()})
        _, route = router.complete("spark", [{"role": "user", "content": "x"}])   # MiniMax is OpenRouter-only
        self.assertTrue(route["fallback"]); self.assertEqual(route["requested"], "spark"); self.assertNotEqual(route["brand"], "spark")


class ModelListMarksNeedsKey(unittest.TestCase):
    def test_availability_follows_keys(self):
        rows = {r["id"]: r for r in catalog.public_list({"nim": "k"})}
        self.assertFalse(rows["spark"]["available"]); self.assertEqual(rows["spark"]["needs_key"], ["openrouter"])
        self.assertTrue(rows["forge"]["available"]); self.assertTrue(rows["auto"]["available"])
        self.assertNotIn("available", rows["claude"])

    def test_no_keys_argument_keeps_old_shape(self):
        self.assertNotIn("available", catalog.public_list()[0])


if __name__ == "__main__":
    unittest.main()
