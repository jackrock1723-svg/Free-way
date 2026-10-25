"""Static-root selection and built-asset serving checks."""

import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

import freecode.server as server
from server_fixture import running_server


class _AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name not in ("href", "src") or not value or value.startswith(("#", "data:")):
                continue
            parsed = urlsplit(value)
            if not parsed.scheme and not parsed.netloc:
                self.paths.add(parsed.path or "/")


def _static_root(root):
    resolver = getattr(server, "static_root", None)
    return resolver(root) if callable(resolver) else Path(root) / "web"


class StaticRootTests(unittest.TestCase):
    def test_static_root_uses_complete_react_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy = root / "web"
            legacy.mkdir()
            (legacy / "index.html").write_text("legacy", encoding="utf-8")

            react = root / "web-react"
            assets = react / "assets"
            assets.mkdir(parents=True)
            (react / "index.html").write_text(
                '<!doctype html><link rel="stylesheet" href="/assets/app.css">'
                '<script type="module" src="/assets/app.js"></script>',
                encoding="utf-8",
            )
            (assets / "app.css").write_text("body { color: white; }", encoding="utf-8")
            (assets / "app.js").write_text("console.log('ready');", encoding="utf-8")

            self.assertEqual(_static_root(root), react.resolve())

    def test_static_root_falls_back_to_legacy_web_when_build_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy = root / "web"
            legacy.mkdir()
            (legacy / "index.html").write_text("legacy", encoding="utf-8")
            self.assertEqual(_static_root(root), legacy.resolve())

            react = root / "web-react"
            react.mkdir()
            (react / "index.html").write_text(
                '<!doctype html><script type="module" src="/assets/missing.js"></script>',
                encoding="utf-8",
            )
            self.assertEqual(_static_root(root), legacy.resolve())

    @unittest.skipUnless(
        (Path(server.__file__).resolve().parent.parent / "web-react" / "index.html").is_file(),
        "React build is generated in Task 3",
    )
    def test_built_react_assets_are_served_from_static_root(self):
        selected_root = server.static_root()
        self.assertEqual(selected_root.name, "web-react")
        required_assets = {
            "/manifest.webmanifest",
            "/favicon.svg",
            "/icon.svg",
            "/icon-192.png",
            "/icon-512.png",
            "/icon-maskable-512.png",
            "/apple-touch-icon.png",
            "/phone.js",
            "/google-signin.js",
            "/sw.js",
        }

        with running_server() as (_, base_url):
            with urlopen(base_url + "/", timeout=3) as response:
                self.assertEqual(response.status, 200)
                html = response.read().decode("utf-8")
            refs = _AssetReferences()
            refs.feed(html)
            for path in sorted(required_assets | refs.paths):
                with self.subTest(asset=path):
                    with urlopen(base_url + path, timeout=3) as response:
                        self.assertEqual(response.status, 200)
                        if path == "/sw.js":
                            self.assertEqual(response.headers.get("Service-Worker-Allowed"), "/")
                        if path == "/manifest.webmanifest":
                            manifest = json.loads(response.read().decode("utf-8"))
                            for icon in manifest.get("icons", []):
                                icon_path = urlsplit(icon["src"]).path
                                with urlopen(base_url + icon_path, timeout=3) as icon_response:
                                    self.assertEqual(icon_response.status, 200)


if __name__ == "__main__":
    unittest.main()
