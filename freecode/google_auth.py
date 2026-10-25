"""Disabled-by-default, owner-only Google popup-auth primitives.

This module deliberately does not integrate HTTP routes, persist state, or call
Google APIs. It verifies GIS ID tokens only and keeps login challenges and app
sessions in process memory.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import math
import re
import secrets
import threading
import time
import urllib.request
from collections import deque
from dataclasses import dataclass
from typing import Callable, Mapping
from urllib.parse import urlsplit


_GENERIC_ERROR = "Authentication request rejected"
_TOKEN_PART_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_SAFE_SUB_RE = re.compile(r"^[A-Za-z0-9_-]{1,255}$")


class AuthError(Exception):
    """A safe public authentication failure with an HTTP status suggestion."""

    def __init__(self, message: str = _GENERIC_ERROR, status: int = 401):
        # Deliberately accept only our generic message; never include credentials,
        # claims, peer addresses, or raw verifier/network exception text.
        safe_message = message if message in {_GENERIC_ERROR, "Google auth configuration is invalid"} else _GENERIC_ERROR
        if isinstance(status, bool) or status not in (400, 401, 429, 503):
            status = 401
        super().__init__(safe_message)
        self.status = status
        self.public_message = safe_message


class ConfigurationError(AuthError):
    def __init__(self):
        super().__init__("Google auth configuration is invalid", 503)


def _finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _safe_ascii(value: object, *, minimum: int = 1, maximum: int = 16_384) -> bool:
    if not isinstance(value, str) or not minimum <= len(value) <= maximum:
        return False
    try:
        value.encode("ascii")
    except UnicodeEncodeError:
        return False
    return all(0x21 <= ord(char) <= 0x7E for char in value)


def _normalize_origin(value: object) -> str:
    if not _safe_ascii(value, maximum=512) or any(char in value for char in "?#"):
        raise ConfigurationError()
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("https", "http") or not parsed.netloc:
            raise ValueError("invalid origin")
        if parsed.username is not None or parsed.password is not None or parsed.path not in ("", "/"):
            raise ValueError("invalid origin")
        host = parsed.hostname
        port = parsed.port
        if not host or host.endswith("."):
            raise ValueError("invalid host")
        if parsed.scheme.lower() == "http":
            try:
                if not ipaddress.ip_address(host).is_loopback:
                    raise ValueError("insecure origin")
            except ValueError:
                if host.lower() != "localhost":
                    raise ValueError("insecure origin")
        elif parsed.scheme.lower() != "https":
            raise ValueError("invalid scheme")
        try:
            canonical_host = host.encode("idna").decode("ascii").lower()
        except UnicodeError as exc:
            raise ValueError("invalid host") from exc
        if not re.fullmatch(r"[a-z0-9.-]+|[0-9a-f:.]+", canonical_host):
            raise ValueError("invalid host")
        if ":" in canonical_host and not canonical_host.startswith("["):
            canonical_host = f"[{canonical_host}]"
        scheme = parsed.scheme.lower()
        default_port = 443 if scheme == "https" else 80
        port_part = f":{port}" if port is not None and port != default_port else ""
        if port is not None and not (1 <= port <= 65535):
            raise ValueError("invalid port")
        return f"{scheme}://{canonical_host}{port_part}"
    except (ValueError, UnicodeError):
        raise ConfigurationError() from None


@dataclass(frozen=True)
class GoogleAuthConfig:
    """Validated configuration for one immutable owner and one origin."""

    enabled: bool
    client_id: str | None = None
    owner_sub: str | None = None
    origin: str | None = None
    multi_user: bool = False

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "GoogleAuthConfig":
        """Load FC_GOOGLE_* values; disabled mode reads no Google settings."""
        if environ is None:
            import os
            environ = os.environ
        toggle = environ.get("FC_GOOGLE_AUTH", "")
        if not isinstance(toggle, str):
            raise ConfigurationError()
        value = toggle.strip().lower()
        if value in ("", "0", "false", "no", "off"):
            return cls(enabled=False)
        if value not in ("1", "true", "yes", "on"):
            raise ConfigurationError()
        client_id = environ.get("FC_GOOGLE_CLIENT_ID")
        owner_sub = environ.get("FC_GOOGLE_OWNER_SUB")
        origin = environ.get("FC_GOOGLE_ORIGIN")
        multi = str(environ.get("FC_GOOGLE_MULTI_USER", "")).strip().lower() in ("1", "true", "yes", "on")
        if not _safe_ascii(client_id, maximum=512):
            raise ConfigurationError()
        if not multi or owner_sub:
            if not _safe_ascii(owner_sub, maximum=255) or not _SAFE_SUB_RE.fullmatch(owner_sub):
                raise ConfigurationError()
        if any(char.isspace() for char in client_id) or not client_id.endswith(".apps.googleusercontent.com"):
            raise ConfigurationError()
        return cls(enabled=True, client_id=client_id, owner_sub=owner_sub or None, origin=_normalize_origin(origin), multi_user=multi)


class _VerifierResponse:
    """Small response protocol accepted by google-auth's transport interface."""

    def __init__(self, data: bytes, status: int = 200):
        self.status = status
        self.data = data
        self.headers = {"content-type": "application/json"}


class _CertificateRequest:
    """Wrap a cert-map test seam or fixed-URL urllib fetch with a hard timeout."""

    def __init__(self, transport: Callable[..., object] | None):
        self._transport = transport

    def __call__(self, url: str, method: str = "GET", **kwargs):
        if url not in ("https://www.googleapis.com/oauth2/v1/certs", "https://www.googleapis.com/oauth2/v3/certs") or method != "GET":
            raise OSError("certificate request rejected")
        if self._transport is None:
            request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status != 200:
                    return _VerifierResponse(b"", response.status)
                data = response.read(262_145)
                if len(data) > 262_144:
                    raise OSError("certificate response too large")
                return _VerifierResponse(data, response.status)
        response = self._transport(url, method=method, timeout=10, **kwargs)
        if isinstance(response, Mapping):
            data = json.dumps(dict(response), separators=(",", ":")).encode("utf-8")
            if len(data) > 262_144:
                raise OSError("certificate response too large")
            return _VerifierResponse(data)
        if not hasattr(response, "status") or not hasattr(response, "data"):
            raise OSError("invalid certificate transport response")
        return response


class GoogleVerifier:
    """Lazy official ``google-auth`` ID-token verifier with injectable cert I/O."""

    def __init__(self, request: Callable[..., object] | None = None):
        self._request = _CertificateRequest(request)

    def verify(self, credential: str, client_id: str) -> Mapping[str, object]:
        if not _safe_ascii(credential, maximum=16_384) or not _safe_ascii(client_id, maximum=512):
            raise AuthError()
        parts = credential.split(".")
        if len(parts) != 3 or any(not _TOKEN_PART_RE.fullmatch(part) for part in parts):
            raise AuthError()
        try:
            # Optional dependency is intentionally loaded only for active login.
            from google.oauth2 import id_token
            claims = id_token.verify_oauth2_token(credential, self._request, audience=client_id)
            if not isinstance(claims, Mapping):
                raise ValueError("invalid verified claims")
            return dict(claims)
        except AuthError:
            raise
        except Exception:
            raise AuthError() from None


@dataclass(frozen=True)
class ChallengeIssue:
    """Issue values: cookie_id is set HttpOnly; nonce and csrf go to same-origin JS."""

    cookie_id: str
    nonce: str
    csrf: str
    expires_at: float


@dataclass(frozen=True)
class SessionIssue:
    """Fresh owner session cookie id, in-memory mutation CSRF token, and expiry."""

    cookie_id: str
    csrf: str
    expires_at: float
    sub: str | None = None
    email: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class SessionInfo:
    """Session lookup result; never contains the Google credential."""

    csrf: str
    expires_at: float
    sub: str | None = None
    email: str | None = None
    name: str | None = None


@dataclass
class _Challenge:
    nonce: str
    csrf: str
    created_at: float
    expires_at: float


@dataclass
class _Session:
    csrf: str
    created_at: float
    expires_at: float
    sub: str | None = None
    email: str | None = None
    name: str | None = None


class OwnerAuth:
    """Bounded, process-local one-owner popup challenge and session store."""

    CHALLENGE_COOKIE_NAME = "__Host-fc_login"
    SESSION_COOKIE_NAME = "__Host-fc_session"
    COOKIE_ATTRIBUTES = {"secure": True, "httponly": True, "samesite": "Lax", "path": "/", "domain": None}
    CHALLENGE_LIFETIME = 300
    SESSION_LIFETIME = 43_200
    MAX_CHALLENGES = 128
    MAX_SESSIONS = 256
    MAX_PEER_BUCKETS = 512
    MAX_ATTEMPTS_PER_MINUTE = 10

    def __init__(self, config: GoogleAuthConfig, verifier: object | None = None,
                 clock: Callable[[], float] = time.time, *,
                 max_challenges: int | None = None, max_sessions: int | None = None,
                 max_peer_buckets: int = 512):
        valid_config = isinstance(config, GoogleAuthConfig) and config.enabled is True
        if valid_config:
            try:
                valid_config = (
                    _safe_ascii(config.client_id, maximum=512)
                    and config.client_id.endswith(".apps.googleusercontent.com")
                    and (getattr(config, "multi_user", False) is True or _SAFE_SUB_RE.fullmatch(config.owner_sub) is not None)
                    and _normalize_origin(config.origin) == config.origin
                )
            except (AttributeError, TypeError, AuthError):
                valid_config = False
        if not valid_config:
            raise ConfigurationError()
        self.config = config
        self.verifier = verifier if verifier is not None else GoogleVerifier()
        self._clock = clock
        self._max_challenges = self.MAX_CHALLENGES if max_challenges is None else max_challenges
        self._max_sessions = self.MAX_SESSIONS if max_sessions is None else max_sessions
        self._max_peer_buckets = max_peer_buckets
        if any(isinstance(n, bool) or not isinstance(n, int) or n < 1 for n in (self._max_challenges, self._max_sessions, self._max_peer_buckets)):
            raise ConfigurationError()
        self._lock = threading.RLock()
        self._challenges: dict[str, _Challenge] = {}
        self._sessions: dict[str, _Session] = {}
        self._attempts: dict[str, deque[float]] = {}
        self._bucket_touched: dict[str, float] = {}

    def _now(self) -> float:
        try:
            now = self._clock()
            if not _finite_number(now):
                raise ValueError
            return float(now)
        except Exception:
            raise AuthError() from None

    @staticmethod
    def _valid_origin(origin: object, expected: str) -> bool:
        return _safe_ascii(origin, maximum=512) and hmac.compare_digest(origin, expected)

    @staticmethod
    def _valid_opaque(value: object, maximum: int = 128) -> bool:
        return _safe_ascii(value, maximum=maximum) and bool(re.fullmatch(r"[A-Za-z0-9_-]+", value))

    def _peer_key(self, peer: object) -> str:
        if not _safe_ascii(peer, maximum=128):
            raise AuthError()
        return peer

    def _consume_rate_slot(self, peer: str, now: float) -> None:
        cutoff = now - 60.0
        for key in list(self._attempts):
            entries = self._attempts[key]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if not entries:
                self._attempts.pop(key, None)
                self._bucket_touched.pop(key, None)
        if peer not in self._attempts and len(self._attempts) >= self._max_peer_buckets:
            oldest = min(self._bucket_touched, key=self._bucket_touched.get)
            self._attempts.pop(oldest, None)
            self._bucket_touched.pop(oldest, None)
        bucket = self._attempts.setdefault(peer, deque())
        if len(bucket) >= self.MAX_ATTEMPTS_PER_MINUTE:
            raise AuthError(status=429)
        bucket.append(now)
        self._bucket_touched[peer] = now

    def _prune_challenges(self, now: float) -> None:
        for cookie_id in [key for key, item in self._challenges.items() if item.expires_at <= now]:
            self._challenges.pop(cookie_id, None)

    def _prune_sessions(self, now: float) -> None:
        for session_id in [key for key, item in self._sessions.items() if item.expires_at <= now]:
            self._sessions.pop(session_id, None)

    @property
    def pending_challenges(self) -> int:
        with self._lock:
            self._prune_challenges(self._now())
            return len(self._challenges)

    @property
    def active_sessions(self) -> int:
        with self._lock:
            self._prune_sessions(self._now())
            return len(self._sessions)

    @property
    def peer_bucket_count(self) -> int:
        with self._lock:
            self._consume_rate_slot("__inspection_probe__", self._now())
            self._attempts.pop("__inspection_probe__", None)
            self._bucket_touched.pop("__inspection_probe__", None)
            return len(self._attempts)

    def issue_challenge(self, *, origin: str, peer: str) -> ChallengeIssue:
        if not self._valid_origin(origin, self.config.origin):
            raise AuthError()
        peer_key = self._peer_key(peer)
        now = self._now()
        with self._lock:
            self._consume_rate_slot(peer_key, now)
            self._prune_challenges(now)
            if len(self._challenges) >= self._max_challenges:
                oldest = min(self._challenges, key=lambda key: self._challenges[key].created_at)
                self._challenges.pop(oldest, None)
            cookie_id = secrets.token_urlsafe(32)
            nonce = secrets.token_urlsafe(32)
            csrf = secrets.token_urlsafe(32)
            self._challenges[cookie_id] = _Challenge(nonce, csrf, now, now + self.CHALLENGE_LIFETIME)
        return ChallengeIssue(cookie_id, nonce, csrf, now + self.CHALLENGE_LIFETIME)

    def verify_login(self, *, credential: str, challenge_cookie: str, login_csrf: str, origin: str, peer: str) -> SessionIssue:
        # Shape, exact origin, cookie and CSRF validation all precede any verifier or network call.
        if not _safe_ascii(credential, maximum=16_384) or not credential.isascii():
            raise AuthError()
        segments = credential.split(".")
        if len(segments) != 3 or any(not _TOKEN_PART_RE.fullmatch(part) for part in segments):
            raise AuthError()
        if not self._valid_origin(origin, self.config.origin):
            raise AuthError()
        if not self._valid_opaque(challenge_cookie) or not self._valid_opaque(login_csrf):
            raise AuthError()
        peer_key = self._peer_key(peer)
        now = self._now()
        with self._lock:
            self._consume_rate_slot(peer_key, now)
            challenge = self._challenges.get(challenge_cookie)
            if challenge is None or challenge.expires_at <= now or not hmac.compare_digest(login_csrf, challenge.csrf):
                if challenge is not None:
                    self._challenges.pop(challenge_cookie, None)
                raise AuthError()
            # One-use is atomic: remove before any verifier work (including failing I/O).
            self._challenges.pop(challenge_cookie, None)
        try:
            claims = self.verifier.verify(credential, self.config.client_id)
            if not isinstance(claims, Mapping):
                raise ValueError
            aud = claims.get("aud")
            issuer = claims.get("iss")
            exp = claims.get("exp")
            sub = claims.get("sub")
            nonce = claims.get("nonce")
            if aud != self.config.client_id or issuer not in ("accounts.google.com", "https://accounts.google.com"):
                raise ValueError
            if not _finite_number(exp) or float(exp) <= self._now():
                raise ValueError
            if not isinstance(sub, str) or not _SAFE_SUB_RE.fullmatch(sub):
                raise ValueError
            if self.config.multi_user:
                if claims.get("email_verified") not in (True, "true"):
                    raise ValueError
            elif not hmac.compare_digest(sub, self.config.owner_sub):
                raise ValueError
            email = claims.get("email")
            email = email[:320] if isinstance(email, str) and "@" in email else None
            name = claims.get("name")
            name = name[:200] if isinstance(name, str) else None
            if not self._valid_opaque(nonce) or not hmac.compare_digest(nonce, challenge.nonce):
                raise ValueError
        except Exception:
            raise AuthError() from None
        issued_at = self._now()
        with self._lock:
            self._prune_sessions(issued_at)
            if len(self._sessions) >= self._max_sessions:
                oldest = min(self._sessions, key=lambda key: self._sessions[key].created_at)
                self._sessions.pop(oldest, None)
            session_id = secrets.token_urlsafe(32)
            csrf = secrets.token_urlsafe(32)
            expiry = issued_at + self.SESSION_LIFETIME
            self._sessions[session_id] = _Session(csrf, issued_at, expiry, sub, email, name)
        return SessionIssue(session_id, csrf, expiry, sub, email, name)

    def get_session(self, session_id: str, *, now: float | None = None) -> SessionInfo | None:
        if not self._valid_opaque(session_id):
            return None
        current = self._now() if now is None else now
        if not _finite_number(current):
            return None
        with self._lock:
            item = self._sessions.get(session_id)
            if item is None or item.expires_at <= float(current):
                self._sessions.pop(session_id, None)
                return None
            return SessionInfo(item.csrf, item.expires_at, item.sub, item.email, item.name)

    def revoke_session(self, session_id: str) -> bool:
        if not self._valid_opaque(session_id):
            return False
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def validate_mutation(self, session_id: str, csrf: str, origin: str) -> bool:
        if not self._valid_origin(origin, self.config.origin) or not self._valid_opaque(csrf):
            raise AuthError()
        session = self.get_session(session_id)
        if session is None or not hmac.compare_digest(csrf, session.csrf):
            raise AuthError()
        return True
