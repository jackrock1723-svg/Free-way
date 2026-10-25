"""Offline-only local HTTP fixture for baseline and integration tests."""

from __future__ import annotations

import os

os.environ["FC_GOOGLE_AUTH"] = "off"
os.environ["FC_MCP"] = "0"
os.environ["FC_ADS"] = "off"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
# Test-only admin token (never used outside the temporary test servers).
E2E_ADMIN_TOKEN = "fw-e2e-admin-token-0123456789"
import hashlib as _hashlib
os.environ["FW_ADMIN_TOKEN_SHA256"] = _hashlib.sha256(E2E_ADMIN_TOKEN.encode()).hexdigest()
for _name in (
    "OPENROUTER_API_KEY",
    "NVIDIA_API_KEY",
    "GROQ_API_KEY",
    "GITHUB_MODELS_TOKEN",
    "MISTRAL_API_KEY",
    "CLOUDFLARE_AI_KEY",
    "FREECODE_TOKEN",
):
    os.environ.pop(_name, None)

import json
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from urllib.error import URLError
from urllib.request import urlopen

from freecode.server import App, serve


@contextmanager
def running_server():
    """Yield a mock-backed App and a fresh loopback server with temporary data."""
    with tempfile.TemporaryDirectory(prefix="freecode-baseline-") as data_dir:
        app = App(data_dir, mode="local", token=None, mock=True)
        httpd = serve(app, "127.0.0.1", 0)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{httpd.server_address[1]}"
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                try:
                    with urlopen(f"{base_url}/api/health", timeout=0.5) as response:
                        if response.status == 200:
                            break
                except (OSError, URLError):
                    time.sleep(0.02)
            else:
                raise RuntimeError("test server did not become healthy")
            yield app, base_url
        finally:
            httpd.shutdown()
            thread.join(timeout=5)
            httpd.server_close()


def main() -> int:
    """Run as a Playwright-managed subprocess and publish its ephemeral URL."""
    with tempfile.TemporaryDirectory(prefix="freecode-playwright-") as data_dir:
        app = App(data_dir, mode="local", token=None, mock=True)
        seeded = app.storage.upsert_user("e2e-sub-tester", "tester@example.com", "Test User")
        app.storage.record_login(seeded["id"], "tester@example.com", "Test User", "203.0.113.20", "E2E Browser", True)
        app.storage.claim(seeded["id"], "project", "tester-site")
        app.storage.record_usage(seeded["id"], "agent_run", 3)
        httpd = serve(app, "127.0.0.1", 0)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{httpd.server_address[1]}"
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                try:
                    with urlopen(f"{base_url}/api/health", timeout=0.5) as response:
                        if response.status == 200:
                            break
                except (OSError, URLError):
                    time.sleep(0.02)
            else:
                raise RuntimeError("test server did not become healthy")
            print(f"FC_TEST_SERVER_URL={base_url}", flush=True)
            for line in sys.stdin:
                if line.strip() == "stop":
                    break
        finally:
            httpd.shutdown()
            thread.join(timeout=5)
            httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
