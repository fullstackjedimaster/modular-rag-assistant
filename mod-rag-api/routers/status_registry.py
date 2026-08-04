from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, Optional
from uuid import UUID

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
        self._m: Dict[str, _Status] = {}

    def touch(self, rag_host_id: UUID, detail: str = "") -> None:
        key = str(rag_host_id)

        with self._lock:
            st = self._m.get(key) or _Status()
            st.last_seen_at = _now_iso()

            if detail:
                st.detail = detail

            self._m[key] = st

    def connect_exclusive(self, rag_host_id: UUID, detail: str = "") -> None:
        key = str(rag_host_id)
        now = _now_iso()

        with self._lock:
            for host_id, status in self._m.items():
                if status.connected and host_id != key:
                    status.connected = False
                    status.detail = "switched"
                    status.last_seen_at = now

            status = self._m.get(key) or _Status()
            status.connected = True
            status.detail = detail or "connected"
            status.last_seen_at = now
            self._m[key] = status

    def set_connected(self, rag_host_id: UUID, connected: bool, detail: str = "") -> None:
        key = str(rag_host_id)

        with self._lock:
            st = self._m.get(key) or _Status()
            st.connected = connected
            st.last_seen_at = _now_iso()

            if detail:
                st.detail = detail

            self._m[key] = st

    def snapshot(self, only_ids: Iterable[UUID] | None = None) -> Dict[str, _Status]:
        with self._lock:
            if only_ids:
                ids = {str(x) for x in only_ids}
                return {rag_host_id: self._m.get(rag_host_id, _Status()) for rag_host_id in ids}

            return dict(self._m)


REGISTRY = StatusRegistry()