"""Create a Free way admin token.

    python -m freecode.admin_token --data <data folder> --out <file>

Writes the token to --out and stores only its SHA-256 hash in <data>/admin/token.sha256.
Nothing secret is printed (the command prints nothing at all on success).
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import secrets
import sys
from pathlib import Path

HASH_ENV = "FW_ADMIN_TOKEN_SHA256"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_file(data_dir) -> Path:
    return Path(data_dir) / "admin" / "token.sha256"


def stored_hash(data_dir, environ=None) -> str | None:
    environ = os.environ if environ is None else environ
    value = (environ.get(HASH_ENV) or "").strip().lower()
    if not value:
        try:
            value = hash_file(data_dir).read_text(encoding="ascii").strip().lower()
        except OSError:
            return None
    return value if len(value) == 64 and all(c in "0123456789abcdef" for c in value) else None


def token_matches(data_dir, token: str | None, environ=None) -> bool:
    expected = stored_hash(data_dir, environ)
    if not expected or not isinstance(token, str) or not (16 <= len(token) <= 256):
        return False
    return hmac.compare_digest(token_hash(token), expected)


def create(data_dir, out_file, *, url: str | None = None) -> None:
    token = "fwadm_" + secrets.token_urlsafe(32)
    target = hash_file(data_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(token_hash(token) + "\n", encoding="ascii")
    out = Path(out_file)
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = ["Free way admin access", "=====================", "",
             "Open the admin panel: " + ((url.rstrip("/") + "/#admin") if url else "<your Free way address>/#admin"),
             "Paste this admin token when asked:", "", token, "",
             "Keep this file private. To replace the token, run the script again (the old token stops working).",
             "Signing in with Google using an email listed in ADMIN_EMAILS also opens the panel."]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="freecode.admin_token", description=__doc__)
    ap.add_argument("--data", required=True, help="Free way data folder used by the server (--data)")
    ap.add_argument("--out", required=True, help="file that receives the admin token")
    ap.add_argument("--url", help="public address to write into the file")
    args = ap.parse_args(argv)
    try:
        create(args.data, args.out, url=args.url)
    except OSError as error:
        sys.stderr.write(f"could not write admin access file: {error.strerror or 'error'}\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
