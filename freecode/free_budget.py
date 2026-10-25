"""Conservative persisted attempt budget for strict OpenRouter free routes."""
import json
import math
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from .providers import ProviderError

_LOCKS_GUARD = threading.Lock()
_LOCKS = {}


def _path_lock(path):
    key = str(Path(path).resolve())
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.Lock())


class LocalAttemptBudget:
    """Single-process, single-owner cap; deliberately not a provider quota view."""
    def __init__(self, path, clock=None, rpm=18, rpd=40):
        self.path = Path(path)
        self.clock = clock or __import__("time").time
        self.rpm = int(rpm)
        self.rpd = int(rpd)
        self._lock = _path_lock(self.path)

    def reserve(self):
        """Persist a reservation before transmission, failing closed on state errors."""
        with self._lock:
            try:
                now = float(self.clock())
                if not (math.isfinite(now) and self.rpm > 0 and self.rpd > 0):
                    raise ValueError("invalid limits")
                if self.path.exists():
                    state = json.loads(self.path.read_text(encoding="utf-8"))
                    if not isinstance(state, dict) or set(state) != {"last", "timestamps"}:
                        raise ValueError("invalid state schema")
                    last, timestamps = state["last"], state["timestamps"]
                    if (isinstance(last, bool) or not isinstance(last, (int, float))
                            or not math.isfinite(float(last)) or not isinstance(timestamps, list)
                            or now < float(last)):
                        raise ValueError("invalid state or clock")
                    times = []
                    for ts in timestamps:
                        if (isinstance(ts, bool) or not isinstance(ts, (int, float))
                                or not math.isfinite(float(ts)) or float(ts) > float(last)):
                            raise ValueError("invalid timestamp")
                        times.append(float(ts))
                else:
                    last, times = None, []
                today = datetime.fromtimestamp(now, timezone.utc).date()
                recent = [ts for ts in times if ts > now - 60.0]
                today_count = sum(datetime.fromtimestamp(ts, timezone.utc).date() == today for ts in times)
                times = [ts for ts in times if ts > now - 60.0 or datetime.fromtimestamp(ts, timezone.utc).date() == today]
                if len(recent) >= self.rpm or today_count >= self.rpd:
                    raise ProviderError("Strict free-route local attempt limit reached; wait and retry", 429, False)
                times.append(now)
                payload = json.dumps({"last": now, "timestamps": times}, separators=(",", ":"))
                self.path.parent.mkdir(parents=True, exist_ok=True)
                fd, temp = tempfile.mkstemp(prefix=".free-route-budget-", dir=str(self.path.parent))
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as stream:
                        stream.write(payload)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temp, self.path)
                finally:
                    if os.path.exists(temp):
                        os.unlink(temp)
            except ProviderError:
                raise
            except Exception:
                raise ProviderError("Strict free-route budget unavailable; request stopped safely", 503, False) from None
