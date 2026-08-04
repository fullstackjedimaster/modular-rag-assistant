# /mod-rag-api/routers/routes_rag_hosts.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from routers.db import call_jsonb, call_rows, call_val
from routers.schemas import (
    ConnectResponse,
    ContentDocIn,
    ContentDocRow,
    CreateRagHostIn,
    RagHostFull,
    RagHostRow,
    RagHostStatus,
    TelemetryMessageIn,
    TelemetryMessageRow,
    UpdateRagHostIn,
)
from routers.status_registry import REGISTRY

router = APIRouter(prefix="/api/rag-hosts", tags=["rag-hosts"])


# ---------------------------
# Hosts
# ---------------------------

@router.get("", response_model=List[RagHostRow])
async def list_hosts(request: Request) -> List[RagHostRow]:
    rows = await call_rows(request, "rag.list_rag_hosts")
    return [RagHostRow(**r) for r in rows]


@router.get("/json")
async def list_hosts_json(request: Request) -> Any:
    obj = await call_jsonb(request, "rag.list_rag_hosts_json")
    return obj if obj is not None else []


@router.post("", response_model=Dict[str, str])
async def createhost(request: Request, body: CreateRagHostIn) -> Dict[str, str]:
    try:
        new_id = await call_val(request, "rag.create_rag_host", body.name, body.host_url)
        return {"id": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# Runtime status
# IMPORTANT: this must appear before /{rag_host_id}
# ---------------------------

@router.get("/status", response_model=Dict[str, RagHostStatus])
async def get_statuses(
    rag_host_ids: Optional[List[UUID]] = Query(default=None, alias="ragHostId"),

) -> Dict[str, RagHostStatus]:
    requested_ids = rag_host_ids

    snap = REGISTRY.snapshot(requested_ids)

    return {
        str(cid): RagHostStatus(
            connected=st.connected,
            detail=st.detail,
            last_seen_at=st.last_seen_at,
        )
        for cid, st in snap.items()
    }


@router.put("/{rag_host_id}", response_model=Dict[str, bool])
async def updatehost(
    request: Request,
    rag_host_id: UUID,
    body: UpdateRagHostIn,
) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.update_rag_host", rag_host_id, body.name, body.host_url)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_host_id}", response_model=Dict[str, bool])
async def deletehost(request: Request, rag_host_id: UUID) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_rag_host", rag_host_id)
        REGISTRY.set_connected(rag_host_id, False, detail="deleted")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{rag_host_id}", response_model=RagHostFull)
async def get_host_full(request: Request, rag_host_id: UUID) -> RagHostFull:
    obj = await call_jsonb(request, "rag.get_rag_host_json", rag_host_id)

    if obj is None:
        raise HTTPException(status_code=404, detail="rag_host not found")

    return RagHostFull(**obj)


@router.post("/{rag_host_id}/ping", response_model=Dict[str, bool])
async def ping_host(rag_host_id: UUID, detail: str = "") -> Dict[str, bool]:
    REGISTRY.touch(rag_host_id, detail=detail)
    return {"ok": True}


@router.post("/{rag_host_id}/connect", response_model=ConnectResponse)
async def connect_host(request: Request, rag_host_id: UUID) -> ConnectResponse:
    obj = await call_jsonb(request, "rag.get_rag_host_json", rag_host_id)

    if obj is None:
        raise HTTPException(status_code=404, detail="rag_host not found")

    REGISTRY.connect_exclusive(rag_host_id, detail="connected")
    return ConnectResponse(ok=True, detail="connected")


@router.post("/{rag_host_id}/disconnect", response_model=ConnectResponse)
async def disconnect_host(rag_host_id: UUID) -> ConnectResponse:
    REGISTRY.set_connected(rag_host_id, False, detail="disconnected")
    return ConnectResponse(ok=True, detail="disconnected")


# ---------------------------
# Content Docs CRUD + list by host
# ---------------------------

@router.get("/{rag_host_id}/content-docs", response_model=List[ContentDocRow])
async def list_content_docs(request: Request, rag_host_id: UUID) -> List[ContentDocRow]:
    rows = await call_rows(request, "rag.list_content_docs_by_host", rag_host_id)
    return [ContentDocRow(**r) for r in rows]


@router.post("/{rag_host_id}/content-docs", response_model=Dict[str, str])
async def add_content_doc(
    request: Request,
    rag_host_id: UUID,
    body: ContentDocIn,
) -> Dict[str, str]:
    try:
        new_id = await call_val(
            request,
            "rag.create_content_doc",
            rag_host_id,
            body.doc_name,
            body.file_path,
        )
        return {"ragHostId": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rag_host_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def update_content_doc(
    request: Request,
    rag_host_id: UUID,
    doc_id: UUID,
    body: ContentDocIn,
) -> Dict[str, bool]:
    try:
        await call_val(
            request,
            "rag.update_content_doc_by_host",
            rag_host_id,
            doc_id,
            body.doc_name,
            body.file_path,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_host_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def delete_content_doc(
    request: Request,
    rag_host_id: UUID,
    doc_id: UUID,
) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_content_doc_by_host", rag_host_id, doc_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------
# Telemetry Messages CRUD + list by host
# ---------------------------

@router.get("/{rag_host_id}/telemetry-messages", response_model=List[TelemetryMessageRow])
async def list_telemetry_messages(
    request: Request,
    rag_host_id: UUID,
) -> List[TelemetryMessageRow]:
    rows = await call_rows(request, "rag.list_telemetry_messages_by_host", rag_host_id)
    return [TelemetryMessageRow(**r) for r in rows]


@router.post("/{rag_host_id}/telemetry-messages", response_model=Dict[str, str])
async def add_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    body: TelemetryMessageIn,
) -> Dict[str, str]:
    try:
        new_id = await call_val(
            request,
            "rag.create_telemetry_message",
            rag_host_id,
            body.message_name,
            body.message_value,
        )
        return {"ragHostId": str(new_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{rag_host_id}/telemetry-messages/{msg_id}", response_model=Dict[str, bool])
async def update_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    msg_id: UUID,
    body: TelemetryMessageIn,
) -> Dict[str, bool]:
    try:
        await call_val(
            request,
            "rag.update_telemetry_message_by_host",
            rag_host_id,
            msg_id,
            body.message_name,
            body.message_value,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{rag_host_id}/telemetry-messages/{msg_id}", response_model=Dict[str, bool])
async def delete_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    msg_id: UUID,
) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_telemetry_message_by_host", rag_host_id, msg_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))