from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional, Iterable


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class _Status:
    connected: bool = False
    detail: str = ""
    last_seen_at: Optional[str] = None


class StatusRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._m: Dict[int, _Status] = {}

    def touch(self, client_id: int, detail: str = "") -> None:
        with self._lock:
            st = self._m.get(client_id) or _Status()
            st.last_seen_at = _now_iso()
            if detail:
                st.detail = detail
            self._m[client_id] = st

    def set_connected(self, client_id: int, connected: bool, detail: str = "") -> None:
        with self._lock:
            st = self._m.get(client_id) or _Status()
            st.connected = connected
            st.last_seen_at = _now_iso()
            if detail:
                st.detail = detail
            self._m[client_id] = st

    def snapshot(self, only_ids: Iterable[int] | None = None) -> Dict[int, _Status]:
        with self._lock:
            if only_ids:
                ids = set(int(x) for x in only_ids)
                return {cid: self._m.get(cid, _Status()) for cid in ids}
            return dict(self._m)


REGISTRY = StatusRegistry()
