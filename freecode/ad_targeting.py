"""Ads v2 targeting signals from a project's stack.

Only *names from a fixed allow-list* (languages, frameworks, well-known packages) ever leave this module, so
file contents, paths, secrets and private package names can never reach an ad network. The file list comes from
the code index's ``list_files`` (which already skips secrets, .env files and vendored folders).
"""
from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path

from .code_index import list_files

LANGUAGES = {
    ".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".cpp": "C++",
    ".c": "C", ".swift": "Swift", ".dart": "Dart", ".vue": "Vue", ".svelte": "Svelte", ".html": "HTML", ".css": "CSS", ".scss": "CSS",
    ".sql": "SQL",
}

# known package/framework name -> (display name, ad categories)
KNOWN = {
    "react": ("React", ("design", "hosting")), "next": ("Next.js", ("hosting",)), "vue": ("Vue", ("design", "hosting")),
    "svelte": ("Svelte", ("hosting",)), "@sveltejs/kit": ("SvelteKit", ("hosting",)), "vite": ("Vite", ("hosting",)),
    "express": ("Express", ("hosting", "monitoring")), "fastify": ("Fastify", ("hosting",)), "@nestjs/core": ("NestJS", ("hosting",)),
    "tailwindcss": ("Tailwind CSS", ("design",)), "react-native": ("React Native", ("mobile",)), "expo": ("Expo", ("mobile",)),
    "electron": ("Electron", ("hosting",)), "flutter": ("Flutter", ("mobile",)),
    "prisma": ("Prisma", ("databases",)), "@prisma/client": ("Prisma", ("databases",)), "pg": ("Postgres", ("databases",)),
    "mysql2": ("MySQL", ("databases",)), "mongoose": ("MongoDB", ("databases",)), "mongodb": ("MongoDB", ("databases",)),
    "redis": ("Redis", ("databases",)), "ioredis": ("Redis", ("databases",)), "@supabase/supabase-js": ("Supabase", ("databases", "auth")),
    "firebase": ("Firebase", ("databases", "auth")), "drizzle-orm": ("Drizzle", ("databases",)), "sqlite3": ("SQLite", ("databases",)),
    "jest": ("Jest", ("testing",)), "vitest": ("Vitest", ("testing",)), "@playwright/test": ("Playwright", ("testing",)),
    "cypress": ("Cypress", ("testing",)), "mocha": ("Mocha", ("testing",)),
    "@sentry/node": ("Sentry", ("monitoring",)), "@sentry/react": ("Sentry", ("monitoring",)), "winston": ("Winston", ("monitoring",)),
    "next-auth": ("NextAuth", ("auth",)), "passport": ("Passport", ("auth",)), "@clerk/clerk-react": ("Clerk", ("auth",)),
    "stripe": ("Stripe", ("payments",)), "@stripe/stripe-js": ("Stripe", ("payments",)),
    "openai": ("OpenAI SDK", ("ai_apis",)), "@anthropic-ai/sdk": ("Anthropic SDK", ("ai_apis",)), "langchain": ("LangChain", ("ai_apis",)),
    "chart.js": ("Chart.js", ("data",)), "d3": ("D3", ("data",)), "recharts": ("Recharts", ("data",)),
    # Python
    "django": ("Django", ("hosting", "databases")), "flask": ("Flask", ("hosting",)), "fastapi": ("FastAPI", ("hosting",)),
    "sqlalchemy": ("SQLAlchemy", ("databases",)), "psycopg": ("Postgres", ("databases",)), "psycopg2": ("Postgres", ("databases",)),
    "psycopg2-binary": ("Postgres", ("databases",)), "pymongo": ("MongoDB", ("databases",)), "pytest": ("pytest", ("testing",)),
    "sentry-sdk": ("Sentry", ("monitoring",)), "pandas": ("pandas", ("data",)), "numpy": ("NumPy", ("data",)),
    "streamlit": ("Streamlit", ("data", "hosting")), "transformers": ("Transformers", ("ai_apis",)), "torch": ("PyTorch", ("ai_apis",)),
    "authlib": ("Authlib", ("auth",)), "celery": ("Celery", ("monitoring",)), "gunicorn": ("Gunicorn", ("hosting",)),
    "uvicorn": ("Uvicorn", ("hosting",)),
    # Go / Rust markers (module names)
    "github.com/gin-gonic/gin": ("Gin", ("hosting",)), "gorm.io/gorm": ("GORM", ("databases",)),
    "actix-web": ("Actix", ("hosting",)), "axum": ("Axum", ("hosting",)), "tokio": ("Tokio", ("hosting",)),
    "diesel": ("Diesel", ("databases",)), "sqlx": ("SQLx", ("databases",)),
}
MARKER_FILES = {"Dockerfile": ("Docker", ("hosting",)), "docker-compose.yml": ("Docker Compose", ("hosting",)),
                "vercel.json": ("Vercel", ("hosting",)), "netlify.toml": ("Netlify", ("hosting",)),
                "manifest.webmanifest": ("PWA", ("mobile",)), "supabase/config.toml": ("Supabase", ("databases", "auth"))}
_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9_.\-]+)")
_PYPROJECT_DEP = re.compile(r"[\"']([A-Za-z0-9_.\-]+)\s*(?:[<>=~!\[;].*)?[\"']")
_GO_REQ = re.compile(r"^\s*(?:require\s+)?([a-z0-9.\-]+\.[a-z]{2,}/[A-Za-z0-9_./\-]+)\s+v", re.M)
_CARGO_DEP = re.compile(r"^\s*([A-Za-z0-9_\-]+)\s*=", re.M)
MAX_MANIFEST_BYTES = 200_000


def _read(path: Path) -> str:
    try:
        if path.stat().st_size > MAX_MANIFEST_BYTES:
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _package_names(root: Path, files: list[str]) -> set[str]:
    names: set[str] = set()
    for rel in files:
        base = rel.rsplit("/", 1)[-1]
        if rel.count("/") > 2:
            continue
        text = None
        if base == "package.json":
            try:
                doc = json.loads(_read(root / rel) or "{}")
            except ValueError:
                doc = {}
            for key in ("dependencies", "devDependencies", "peerDependencies"):
                if isinstance(doc.get(key), dict):
                    names.update(str(k).lower() for k in doc[key])
        elif base.startswith("requirements") and base.endswith(".txt"):
            for line in _read(root / rel).splitlines():
                m = _REQ_NAME.match(line)
                if m and not line.lstrip().startswith(("#", "-")):
                    names.add(m.group(1).lower())
        elif base == "pyproject.toml":
            text = _read(root / rel)
            names.update(m.group(1).lower() for m in _PYPROJECT_DEP.finditer(text))
        elif base == "go.mod":
            names.update(m.group(1) for m in _GO_REQ.finditer(_read(root / rel)))
        elif base == "Cargo.toml":
            text = _read(root / rel)
            section = text.split("[dependencies]", 1)
            if len(section) == 2:
                names.update(m.group(1).lower() for m in _CARGO_DEP.finditer(section[1].split("\n[", 1)[0]))
        elif base == "pubspec.yaml" and "flutter" in _read(root / rel):
            names.add("flutter")
    return names


def stack_signals(root) -> dict:
    """Return allow-listed stack facts: {languages, frameworks, categories{cat: 0..1}}."""
    root = Path(root)
    if not root.is_dir():
        return {"languages": [], "frameworks": [], "categories": {}}
    files = list_files(root)
    counts: dict[str, int] = {}
    for rel in files:
        lang = LANGUAGES.get(Path(rel).suffix.lower())
        if lang:
            counts[lang] = counts.get(lang, 0) + 1
    languages = [k for k, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))][:4]
    frameworks: list[str] = []
    hits: dict[str, int] = {}
    for name in sorted(_package_names(root, files)):
        known = KNOWN.get(name)
        if known:
            if known[0] not in frameworks:
                frameworks.append(known[0])
            for cat in known[1]:
                hits[cat] = hits.get(cat, 0) + 1
    present = set(files)
    for marker, (label, cats) in MARKER_FILES.items():
        if marker in present or (root / marker).is_file():
            if label not in frameworks:
                frameworks.append(label)
            for cat in cats:
                hits[cat] = hits.get(cat, 0) + 1
    categories = {cat: min(1.0, n / 2) for cat, n in hits.items()}
    return {"languages": languages, "frameworks": frameworks[:12], "categories": categories}


class StackCache:
    """Short-lived cache so ad requests do not rescan a project every time."""

    def __init__(self, ttl: float = 120.0, clock=time.monotonic):
        self.ttl, self.clock, self._lock, self._items = ttl, clock, threading.Lock(), {}

    def get(self, key: str, root) -> dict:
        now = self.clock()
        with self._lock:
            item = self._items.get(key)
            if item and now - item[0] < self.ttl:
                return item[1]
        value = stack_signals(root)
        with self._lock:
            self._items[key] = (now, value)
            if len(self._items) > 256:
                self._items.pop(next(iter(self._items)))
        return value
