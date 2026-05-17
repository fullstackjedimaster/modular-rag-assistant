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

    def touch(self, rag_client_id: UUID, detail: str = "") -> None:
        key = str(rag_client_id)

        with self._lock:
            st = self._m.get(key) or _Status()
            st.last_seen_at = _now_iso()

            if detail:
                st.detail = detail

            self._m[key] = st

    def set_connected(self, rag_client_id: UUID, connected: bool, detail: str = "") -> None:
        key = str(rag_client_id)

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
                return {rag_client_id: self._m.get(rag_client_id, _Status()) for rag_client_id in ids}

            return dict(self._m)


REGISTRY = StatusRegistry()