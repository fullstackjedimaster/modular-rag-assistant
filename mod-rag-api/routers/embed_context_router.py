# routers/embed_context_router.py
"""
Embed + context ingestion router (client_context-based)

Design goals:
- No external JWT deps (uses stdlib HMAC-signed token)
- Works behind nginx that strips /api (so this router MUST NOT use prefix="/api")
- Token scopes for:
    - "rag:ask"
    - "context:write"
- Optional short-lived retention of context events in-memory (per rag_client_id + entity_id)
- Admin-gated session mint endpoint

Env vars:
  EMBED_SIGNING_SECRET     (required) secret used to sign tokens
  EMBED_ADMIN_SECRET       (optional) shared secret for POST /embed/session
  EMBED_TOKEN_TTL_SECONDS  (optional) default 600
  EMBED_REQUIRE_ORIGIN     (optional) "1" to enforce origin allowlist checks (default 0)

Routes (backend paths — remember nginx maps external /api/* -> backend /*):
  POST /embed/session
  POST /context/event
  GET  /context/recent
  GET  /embed/whoami
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from settings import env

# ----------------------------- token helpers -----------------------------

def _b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))

def _now() -> int:
    return int(time.time())

def sign_token(payload: Dict[str, Any], secret: str) -> str:
    """
    Format: base64url(json).base64url(hmac_sha256(json_b64url))
    """
    body = _b64url_encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return f"{body}.{_b64url_encode(sig)}"

def verify_token(token: str, secret: str) -> Dict[str, Any]:
    try:
        body_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token format")

    expected = hmac.new(secret.encode("utf-8"), body_b64.encode("utf-8"), hashlib.sha256).digest()
    got = _b64url_decode(sig_b64)

    if not hmac.compare_digest(expected, got):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    try:
        payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    exp = payload.get("exp")
    if exp is not None and int(exp) < _now():
        raise HTTPException(status_code=401, detail="Token expired")

    return payload


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


# ----------------------------- context storage -----------------------------

@dataclass
class Retention:
    max_events: int = 50
    max_age_seconds: int = 600

def _retention() -> Retention:
    # global retention knobs (simple + predictable)
    try:
        return Retention(
            max_events=int(env("CONTEXT_MAX_EVENTS", "50")),
            max_age_seconds=int(env("CONTEXT_MAX_AGE_SECONDS", "600")),
        )
    except Exception:
        return Retention()

def _redact_payload(payload: Any, redact_fields: Iterable[str]) -> Any:
    if not redact_fields:
        return payload
    if isinstance(payload, dict):
        out = dict(payload)
        for k in redact_fields:
            if k in out:
                out[k] = "[REDACTED]"
        return out
    return payload

# In-memory store: (rag_client_id, entity_id) -> deque[events]
_CONTEXT: Dict[Tuple[str, str], Deque[Dict[str, Any]]] = defaultdict(lambda: deque())

def _purge_old(q: Deque[Dict[str, Any]], ret: Retention) -> None:
    cutoff = _now() - ret.max_age_seconds
    while q and int(q[0].get("_ts_s", 0)) < cutoff:
        q.popleft()
    while len(q) > ret.max_events:
        q.popleft()


# ----------------------------- models -----------------------------

class EmbedSessionRequest(BaseModel):
    target: str = Field(..., description="Logical target name (e.g. 'ai-panel')")
    rag_client_id: str = Field(..., description="RAG client id (rag_clients.id)")
    frame_id: str = Field(..., description="Unique iframe id on the host page")
    origin: Optional[str] = Field(None, description="Host page origin (https://...)")
    scopes: List[str] = Field(default_factory=lambda: ["rag:ask", "context:write"])
    entity_id: Optional[str] = Field(None, description="Optional default entity context")

class EmbedSessionResponse(BaseModel):
    token: str
    expires_in: int
    session_id: str

class ContextEvent(BaseModel):
    rag_client_id: str
    entity_id: Optional[str] = None
    event_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    ts: Optional[str] = None  # keep as string to match your ecosystem

class ContextEventResponse(BaseModel):
    ok: bool
    accepted: bool
    retained_until: Optional[str] = None


# ----------------------------- auth dependencies -----------------------------

def _signing_secret() -> str:
    sec = env("EMBED_SIGNING_SECRET")
    if not sec:
        raise HTTPException(status_code=500, detail="Missing EMBED_SIGNING_SECRET env var")
    return sec

def _require_admin(request: Request) -> None:
    """
    Simple shared-secret admin gate. Swap for Auth0/JWT later.
    """
    admin_secret = env("EMBED_ADMIN_SECRET")
    if not admin_secret:
        raise HTTPException(status_code=403, detail="Admin endpoint disabled (set EMBED_ADMIN_SECRET)")
    got = request.headers.get("x-embed-admin") or request.headers.get("x-admin-secret")
    if not got or not hmac.compare_digest(got, admin_secret):
        raise HTTPException(status_code=403, detail="Invalid admin secret")

def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    raise HTTPException(status_code=401, detail="Missing Authorization: Bearer <token>")

def require_embed_token(request: Request) -> Dict[str, Any]:
    token = _extract_bearer(request)
    payload = verify_token(token, _signing_secret())

    # Optional origin enforcement
    if _env_bool("EMBED_REQUIRE_ORIGIN", False):
        allowed = payload.get("origins") or []
        if allowed:
            origin = request.headers.get("origin") or request.headers.get("x-embed-origin") or ""
            if origin and origin not in allowed:
                raise HTTPException(status_code=403, detail=f"Origin not allowed: {origin}")

    return payload

def require_scope(scope: str):
    def dep(payload: Dict[str, Any] = Depends(require_embed_token)) -> Dict[str, Any]:
        scopes = payload.get("scopes") or []
        if scope not in scopes:
            raise HTTPException(status_code=403, detail=f"Missing scope: {scope}")
        return payload
    return dep


# ----------------------------- router builder -----------------------------

def build_embed_context_router() -> APIRouter:
    # IMPORTANT: NO "/api" prefix here because nginx already strips /api/
    router = APIRouter(tags=["embed"])

    @router.post("/embed/session", response_model=EmbedSessionResponse)
    async def create_embed_session(req: EmbedSessionRequest, request: Request):
        _require_admin(request)

        ttl = int(env("EMBED_TOKEN_TTL_SECONDS", "600"))
        exp = _now() + max(60, ttl)

        session_id = f"es_{_now()}_{os.urandom(3).hex()}"
        payload: Dict[str, Any] = {
            "typ": "mrp_embed",
            "sid": session_id,
            "rag_client_id": str(req.rag_client_id),
            "frame_id": req.frame_id,
            "target": req.target,
            "scopes": req.scopes,
            "exp": exp,
        }
        if req.origin:
            payload["origins"] = [req.origin]
        if req.entity_id:
            payload["entity_id"] = req.entity_id

        token = sign_token(payload, _signing_secret())
        return EmbedSessionResponse(token=token, expires_in=(exp - _now()), session_id=session_id)

    @router.post("/context/event", response_model=ContextEventResponse)
    async def post_context_event(
        ev: ContextEvent,
        tok: Dict[str, Any] = Depends(require_scope("context:write")),
    ):
        tok_client_id = tok.get("rag_client_id")
        if tok_client_id is not None and int(tok_client_id) != int(ev.rag_client_id):
            raise HTTPException(status_code=403, detail="Token does not allow this rag_client_id")

        entity_id = (ev.entity_id or tok.get("entity_id") or "global").strip() or "global"

        stored_event: Dict[str, Any] = {
            "rag_client_id": str(ev.rag_client_id),
            "entity_id": entity_id,
            "event_type": ev.event_type,
            "payload": _redact_payload(ev.payload, redact_fields=[]),
            "ts": ev.ts or "",
            "_ts_s": _now(),
        }

        key = (str(ev.rag_client_id), entity_id)
        q = _CONTEXT[key]
        q.append(stored_event)

        ret = _retention()
        _purge_old(q, ret)

        retained_until = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_now() + ret.max_age_seconds))
        return ContextEventResponse(ok=True, accepted=True, retained_until=retained_until)

    @router.get("/context/recent")
    async def get_recent_context(
        rag_client_id: str,
        entity_id: Optional[str] = None,
        tok: Dict[str, Any] = Depends(require_scope("rag:ask")),
    ):
        tok_rag_client_id = tok.get("rag_client_id")
        if tok_rag_client_id is not None and str(tok_rag_client_id) != str(rag_client_id):
            raise HTTPException(status_code=403, detail="Token does not allow this rag_client_id")

        eid = (entity_id or tok.get("entity_id") or "global").strip() or "global"
        key = (str(rag_client_id), eid)
        q = _CONTEXT.get(key, deque())

        ret = _retention()
        _purge_old(q, ret)

        events_view = []
        for e in list(q):
            e2 = dict(e)
            e2.pop("_ts_s", None)
            events_view.append(e2)

        return {
            "rag_client_id": str(rag_client_id),
            "entity_id": eid,
            "events": events_view,
            "retention": ret.__dict__,
        }

    @router.get("/embed/whoami")
    async def whoami(payload: Dict[str, Any] = Depends(require_embed_token)):
        return {"ok": True, "token": payload}

    return router
