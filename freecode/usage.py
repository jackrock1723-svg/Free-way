"""Best-effort local storage for upstream-reported usage metadata only."""

from __future__ import annotations

import json
import math
import os
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = 1
PERIODS = {"7d": 7 * 86_400, "30d": 30 * 86_400, "all": None}
_TOKEN_FIELDS = ("input_tokens", "output_tokens", "total_tokens")
_EVENT_FIELDS = frozenset((*_TOKEN_FIELDS, "route", "model", "time"))
MAX_EVENTS = 1_000
MAX_STORE_BYTES = 2_000_000
_MAX_TOKEN_COUNT = (1 << 63) - 1

def _token_count(value: object) -> int | None:
    if type(value) is int and 0 <= value <= _MAX_TOKEN_COUNT:
        return value
    return None


def _timestamp(value: object) -> float | None:
    if type(value) in (int, float) and math.isfinite(value) and value >= 0:
        return float(value)
    if isinstance(value, str) and 0 < len(value) <= 64:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            stamp = parsed.timestamp()
            return stamp if math.isfinite(stamp) and stamp >= 0 else None
        except (OverflowError, OSError, ValueError):
            return None
    return None


def _label(value: object) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 200:
        return None
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        return None
    return value


class UsageStore:
    """Store only upstream token counts, route, model and timestamp; never prompts or keys."""

    def __init__(self, data_dir, clock=time.time):
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / "usage.json"
        self.clock = clock
        self.lock = threading.RLock()

    def _normalize_event(self, event: object) -> dict | None:
        if type(event) is not dict:
            return None
        normalized = {
            "input_tokens": _token_count(event.get("input_tokens")),
            "output_tokens": _token_count(event.get("output_tokens")),
            "total_tokens": _token_count(event.get("total_tokens")),
            "route": _label(event.get("route")),
            "model": _label(event.get("model")),
            "time": _timestamp(event.get("time")),
        }
        if all(normalized[field] is None for field in _TOKEN_FIELDS):
            return None
        return normalized

    def _read_events(self) -> list[dict] | None:
        try:
            if self.path.stat().st_size > MAX_STORE_BYTES:
                return None
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        except (OSError, UnicodeError):
            return None
        try:
            document = json.loads(raw)
        except (json.JSONDecodeError, UnicodeError):
            return None
        if (
            type(document) is not dict
            or type(document.get("schema_version")) is not int
            or document["schema_version"] != SCHEMA_VERSION
            or type(document.get("events")) is not list
        ):
            return None
        events = []
        for event in document["events"][-MAX_EVENTS:]:
            if type(event) is not dict or set(event) != _EVENT_FIELDS:
                return None
            normalized = self._normalize_event(event)
            if normalized is None or normalized != event:
                return None
            events.append(normalized)
        return events

    def _write_events(self, events: list[dict]) -> bool:
        events = events[-MAX_EVENTS:]
        temporary_path = None
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.data_dir,
                prefix=".usage.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
                json.dump(
                    {"schema_version": SCHEMA_VERSION, "events": events},
                    temporary,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_path, self.path)
            return True
        except OSError:
            if temporary_path is not None:
                try:
                    temporary_path.unlink()
                except OSError:
                    pass
            return False

    def record(self, event: dict) -> bool:
        """Persist only allow-listed upstream metadata; storage failure never affects inference."""
        normalized = self._normalize_event(event)
        if normalized is None:
            return False
        with self.lock:
            events = self._read_events()
            if events is None:
                return False
            events.append(normalized)
            return self._write_events(events[-MAX_EVENTS:])

    @staticmethod
    def _unavailable(period: str, reason: str) -> dict:
        return {
            "available": False,
            "period": period,
            "history_limit": MAX_EVENTS,
            "requests": None,
            "input_tokens": None,
            "output_tokens": None,
            "total_tokens": None,
            "cost_usd": None,
            "credits": None,
            "reason": reason,
        }

    def query(self, period: str = "7d") -> dict:
        if period not in PERIODS:
            raise ValueError("unsupported usage period")
        with self.lock:
            events = self._read_events()
        if events is None:
            return self._unavailable(period, "Stored usage history is unavailable.")
        if not events:
            return self._unavailable(period, "No upstream usage records are available.")

        seconds = PERIODS[period]
        if seconds is not None:
            if any(event["time"] is None for event in events):
                return self._unavailable(
                    period,
                    "Usage records are missing time data, so this period cannot be filtered accurately.",
                )
            try:
                now = float(self.clock())
            except (TypeError, ValueError, OverflowError):
                now = float("nan")
            if not math.isfinite(now) or now < 0:
                return self._unavailable(period, "The current time is unavailable for this period.")
            start = now - seconds
            events = [event for event in events if start <= event["time"] <= now]

        if not events:
            return {
                "available": True,
                "period": period,
                "history_limit": MAX_EVENTS,
                "requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cost_usd": None,
                "credits": None,
                "reason": "No upstream usage records were recorded in this period.",
            }

        def sum_field(field: str) -> int | None:
            values = [event[field] for event in events]
            if any(value is None for value in values):
                return None
            return sum(values)

        total_values = []
        for event in events:
            total = event["total_tokens"]
            if total is None and event["input_tokens"] is not None and event["output_tokens"] is not None:
                total = event["input_tokens"] + event["output_tokens"]
            total_values.append(total)
        total_tokens = None if any(value is None for value in total_values) else sum(total_values)
        input_tokens = sum_field("input_tokens")
        output_tokens = sum_field("output_tokens")
        missing_counts = any(value is None for value in (input_tokens, output_tokens, total_tokens))
        return {
            "available": True,
            "period": period,
            "history_limit": MAX_EVENTS,
            "requests": len(events),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
            "cost_usd": None,
            "credits": None,
            "reason": "Some token counts were not reported by the upstream provider." if missing_counts else "",
        }
