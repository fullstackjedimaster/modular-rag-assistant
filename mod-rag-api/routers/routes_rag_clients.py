# /mod-rag-api/routers/routes_rag_clients.py
from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from routers.db import call_jsonb, call_rows, call_val
from routers.schemas import (
    ConnectResponse,
    ContentDocIn,
    ContentDocRow,
    CreateRagClientIn,
    RagClientFull,
    RagClientRow,
    RagClientStatus,
    TelemetryMessageIn,
    TelemetryMessageRow,
    UpdateRagClientIn,
)
from routers.status_registry import REGISTRY

router = APIRouter(prefix="/api/rag-clients", tags=["rag-clients"])


# ---------------------------
# Clients
# ---------------------------

@router.get("", response_model=List[RagClientRow])
async def list_clients(request: Request) -> List[RagClientRow]:
    rows = await call_rows(request, "rag.list_rag_clients")
    return [RagClientRow(**r) for r in rows]


@router.get("/json")
async def list_clients_json(request: Request) -> Any:
    """
    Returns JSONB array from rag.list_rag_clients_json().
    """
    obj = await call_jsonb(request, "rag.list_rag_clients_json")
    return obj if obj is not None else []


@router.post("", response_model=Dict[str, str])
async def create_client(request: Request, body: CreateRagClientIn) -> dict[str, str]:
    try:
        new_id = await call_val(request, "rag.create_rag_client", body.name, body.host_url)
        return {"id": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rag_client_id}", response_model=Dict[str, bool])
async def update_client(request: Request, rag_client_id: UUID, body: UpdateRagClientIn) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.update_rag_client", rag_client_id, body.name, body.host_url)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_client_id}", response_model=Dict[str, bool])
async def delete_client(request: Request, rag_client_id: UUID) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_rag_client", rag_client_id)
        REGISTRY.set_connected(rag_client_id, False, detail="deleted")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{rag_client_id}", response_model=RagClientFull)
async def get_client_full(request: Request, rag_client_id: UUID) -> RagClientFull:
    obj = await call_jsonb(request, "rag.get_rag_client_json", rag_client_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="rag_client not found")
    return RagClientFull(**obj)


# ---------------------------
# Runtime status (dashboard)
# ---------------------------

@router.get("/status", response_model=Dict[UUID, RagClientStatus])
async def get_statuses(ragClientId: List[UUID] = Query(default=[])) -> Dict[UUID, RagClientStatus]:
    snap = REGISTRY.snapshot(ragClientId)
    out: Dict[UUID, RagClientStatus] = {}
    for cid, st in snap.items():
        out[cid] = RagClientStatus(
            connected=st.connected,
            detail=st.detail,
            last_seen_at=st.last_seen_at,
        )
    return out


@router.post("/{rag_client_id}/ping", response_model=Dict[str, bool])
async def ping_client(rag_client_id: UUID, detail: str = "") -> Dict[str, bool]:
    REGISTRY.touch(rag_client_id, detail=detail)
    return {"ok": True}


@router.post("/{rag_client_id}/connect", response_model=ConnectResponse)
async def connect_client(request: Request, rag_client_id: UUID) -> ConnectResponse:
    obj = await call_jsonb(request, "rag.get_rag_client_json", rag_client_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="rag_client not found")

    REGISTRY.set_connected(rag_client_id, True, detail="connect requested")
    return ConnectResponse(ok=True, detail="connect requested")


@router.post("/{rag_client_id}/disconnect", response_model=ConnectResponse)
async def disconnect_client(rag_client_id: UUID) -> ConnectResponse:
    REGISTRY.set_connected(rag_client_id, False, detail="disconnected")
    return ConnectResponse(ok=True, detail="disconnected")


# ---------------------------
# Content Docs CRUD + list by client
# ---------------------------

@router.get("/{rag_client_id}/content-docs", response_model=List[ContentDocRow])
async def list_content_docs(request: Request, rag_client_id: UUID) -> List[ContentDocRow]:
    rows = await call_rows(request, "rag.list_content_docs_by_client", rag_client_id)
    return [ContentDocRow(**r) for r in rows]


@router.post("/{rag_client_id}/content-docs", response_model=Dict[str, str])
async def add_content_doc(request: Request, rag_client_id: UUID, body: ContentDocIn) -> dict[str, str]:
    try:
        new_id = await call_val(request, "rag.create_content_doc", rag_client_id, body.doc_name, body.file_path)
        return {"ragClientId": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rag_client_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def update_content_doc(request: Request, rag_client_id: UUID, doc_id: UUID, body: ContentDocIn) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.update_content_doc_by_client", rag_client_id, doc_id, body.doc_name, body.file_path)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_client_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def delete_content_doc(request: Request, rag_client_id: UUID, doc_id: UUID) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_content_doc_by_client", rag_client_id, doc_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# Telemetry Messages CRUD + list by client
# ---------------------------

@router.get("/{rag_client_id}/telemetry-messages", response_model=List[TelemetryMessageRow])
async def list_telemetry_messages(request: Request, rag_client_id: UUID) -> List[TelemetryMessageRow]:
    rows = await call_rows(request, "rag.list_telemetry_messages_by_client", rag_client_id)
    return [TelemetryMessageRow(**r) for r in rows]


@router.post("/{rag_client_id}/telemetry-messages", response_model=Dict[str, str])
async def add_telemetry_message(request: Request, rag_client_id: UUID, body: TelemetryMessageIn) -> Dict[str, str]:
    try:
        new_id = await call_val(
            request,
            "rag.create_telemetry_message",
            rag_client_id,
            body.message_name,
            body.message_value,
        )
        return {"ragClientId": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rag_client_id}/telemetry-messages/{msg_id}", response_model=Dict[str, bool])
async def update_telemetry_message(
    request: Request,
    rag_client_id: UUID,
    msg_id: UUID,
    body: TelemetryMessageIn,
) -> Dict[str, bool]:
    try:
        await call_val(
            request,
            "rag.update_telemetry_message_by_client",
            rag_client_id,
            msg_id,
            body.message_name,
            body.message_value,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_client_id}/telemetry-messages/{msg_id}", response_model=Dict[str, bool])
async def delete_telemetry_message(request: Request, rag_client_id: UUID, msg_id: UUID) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_telemetry_message_by_client", rag_client_id, msg_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


