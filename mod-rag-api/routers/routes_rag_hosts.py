# /mod-rag-api/routers/routes_rag_hosts.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from routers.db import call_jsonb, call_rows, fetch_rows, call_val
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


class SystemPromptBody(BaseModel):
    text: str = ""


class ContextMessageIn(BaseModel):
    name: str = Field(..., min_length=1)


class ContextMessagesBody(BaseModel):
    rows: List[ContextMessageIn] = Field(default_factory=list)


# ---------------------------
# Hosts
# ---------------------------

@router.get("", response_model=List[RagHostRow])
async def list_hosts(request: Request) -> List[RagHostRow]:
    rows = await call_rows(request, "rag.list_rag_hosts")
    return [RagHostRow(**row) for row in rows]


@router.get("/json")
async def list_hosts_json(request: Request) -> Any:
    obj = await call_jsonb(request, "rag.list_rag_hosts_json")
    return obj if obj is not None else []


@router.post("", response_model=Dict[str, str])
async def create_host(request: Request, body: CreateRagHostIn) -> Dict[str, str]:
    try:
        new_id = await call_val(request, "rag.create_rag_host", body.name, body.host_url)
        return {"id": str(new_id)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------
# Runtime status
# This route must appear before /{rag_host_id}.
# ---------------------------

@router.get("/status", response_model=Dict[str, RagHostStatus])
async def get_statuses(
    rag_host_ids: Optional[List[UUID]] = Query(default=None, alias="id"),
) -> Dict[str, RagHostStatus]:
    snapshot = REGISTRY.snapshot(rag_host_ids)
    return {
        str(host_id): RagHostStatus(
            connected=status.connected,
            detail=status.detail,
            last_seen_at=status.last_seen_at,
        )
        for host_id, status in snapshot.items()
    }


@router.get("/{rag_host_id}", response_model=RagHostFull)
async def get_host_full(request: Request, rag_host_id: UUID) -> RagHostFull:
    obj = await call_jsonb(request, "rag.get_rag_host_json", rag_host_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="RAG host not found")
    return RagHostFull(**obj)


@router.put("/{rag_host_id}", response_model=Dict[str, bool])
async def update_host(
    request: Request,
    rag_host_id: UUID,
    body: UpdateRagHostIn,
) -> Dict[str, bool]:
    try:
        await call_val(
            request,
            "rag.update_rag_host_basic",
            rag_host_id,
            body.name,
            body.host_url,
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{rag_host_id}", response_model=Dict[str, bool])
async def delete_host(request: Request, rag_host_id: UUID) -> Dict[str, bool]:
    try:
        await call_val(request, "rag.delete_rag_host", rag_host_id)
        REGISTRY.set_connected(rag_host_id, False, detail="deleted")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{rag_host_id}/ping", response_model=Dict[str, bool])
async def ping_host(rag_host_id: UUID, detail: str = "") -> Dict[str, bool]:
    REGISTRY.touch(rag_host_id, detail=detail)
    return {"ok": True}


@router.post("/{rag_host_id}/connect", response_model=ConnectResponse)
async def connect_host(request: Request, rag_host_id: UUID) -> ConnectResponse:
    obj = await call_jsonb(request, "rag.get_rag_host_json", rag_host_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="RAG host not found")
    REGISTRY.connect_exclusive(rag_host_id, detail="connected")
    return ConnectResponse(ok=True, detail="connected")


@router.post("/{rag_host_id}/disconnect", response_model=ConnectResponse)
async def disconnect_host(rag_host_id: UUID) -> ConnectResponse:
    REGISTRY.set_connected(rag_host_id, False, detail="disconnected")
    return ConnectResponse(ok=True, detail="disconnected")


# ---------------------------
# Content documents
# ---------------------------

@router.get("/{rag_host_id}/content-docs", response_model=List[ContentDocRow])
async def list_content_docs(request: Request, rag_host_id: UUID) -> List[ContentDocRow]:
    rows = await fetch_rows(request, "SELECT id, doc_name, file_path, created_at, updated_at FROM rag.content_doc WHERE rag_host_id = $1 ORDER BY doc_name", rag_host_id)
    return [ContentDocRow(**row) for row in rows]


@router.post("/{rag_host_id}/content-docs", response_model=Dict[str, str])
async def add_content_doc(
    request: Request,
    rag_host_id: UUID,
    body: ContentDocIn,
) -> Dict[str, str]:
    new_id = await call_val(
        request,
        "rag.create_content_doc",
        rag_host_id,
        body.doc_name,
        body.file_path,
    )
    return {"id": str(new_id)}


@router.put("/{rag_host_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def update_content_doc(
    request: Request,
    rag_host_id: UUID,
    doc_id: UUID,
    body: ContentDocIn,
) -> Dict[str, bool]:
    await call_val(
        request,
        "rag.update_content_doc_by_host",
        rag_host_id,
        doc_id,
        body.doc_name,
        body.file_path,
    )
    return {"ok": True}


@router.delete("/{rag_host_id}/content-docs/{doc_id}", response_model=Dict[str, bool])
async def delete_content_doc(
    request: Request,
    rag_host_id: UUID,
    doc_id: UUID,
) -> Dict[str, bool]:
    await call_val(request, "rag.delete_content_doc_by_host", rag_host_id, doc_id)
    return {"ok": True}


# ---------------------------
# Telemetry/context messages
# ---------------------------

@router.get("/{rag_host_id}/telemetry-messages", response_model=List[TelemetryMessageRow])
async def list_telemetry_messages(
    request: Request,
    rag_host_id: UUID,
) -> List[TelemetryMessageRow]:
    rows = await call_rows(request, "rag.list_telemetry_messages_by_host", rag_host_id)
    return [TelemetryMessageRow(**row) for row in rows]


@router.post("/{rag_host_id}/telemetry-messages", response_model=Dict[str, str])
async def add_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    body: TelemetryMessageIn,
) -> Dict[str, str]:
    new_id = await call_val(
        request,
        "rag.create_telemetry_message",
        rag_host_id,
        body.message_name,
        "",
    )
    return {"id": str(new_id)}


@router.put("/{rag_host_id}/telemetry-messages/{message_id}", response_model=Dict[str, bool])
async def update_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    message_id: UUID,
    body: TelemetryMessageIn,
) -> Dict[str, bool]:
    await call_val(
        request,
        "rag.update_telemetry_message_by_host",
        rag_host_id,
        message_id,
        body.message_name,
        "",
    )
    return {"ok": True}


@router.delete("/{rag_host_id}/telemetry-messages/{message_id}", response_model=Dict[str, bool])
async def delete_telemetry_message(
    request: Request,
    rag_host_id: UUID,
    message_id: UUID,
) -> Dict[str, bool]:
    await call_val(
        request,
        "rag.delete_telemetry_message_by_host",
        rag_host_id,
        message_id,
    )
    return {"ok": True}


# Compatibility endpoint used by the management UI. These rows are backed by
# rag.telemetry_message; the API name describes their role in prompt context.
@router.get("/{rag_host_id}/context-messages")
async def get_context_messages(request: Request, rag_host_id: UUID) -> Dict[str, Any]:
    rows = await call_rows(request, "rag.list_telemetry_messages_by_host", rag_host_id)
    return {
        "rows": [
            {
                "id": str(row["id"]),
                "name": row["message_name"],
            }
            for row in rows
        ]
    }


@router.put("/{rag_host_id}/context-messages", response_model=Dict[str, bool])
async def replace_context_messages(
    request: Request,
    rag_host_id: UUID,
    body: ContextMessagesBody,
) -> Dict[str, bool]:
    await call_val(
        request,
        "rag.replace_telemetry_messages_for_host",
        rag_host_id,
        json.dumps([{"name": row.name} for row in body.rows]),
    )
    return {"ok": True}


# ---------------------------
# System prompt
# ---------------------------

@router.get("/{rag_host_id}/system-prompt")
async def get_system_prompt(request: Request, rag_host_id: UUID) -> Dict[str, str]:
    text = await call_val(request, "rag.get_rag_host_prompt", rag_host_id)
    if text is None:
        raise HTTPException(status_code=404, detail="RAG host not found")
    return {"text": str(text)}


@router.put("/{rag_host_id}/system-prompt", response_model=Dict[str, bool])
async def save_system_prompt(
    request: Request,
    rag_host_id: UUID,
    body: SystemPromptBody,
) -> Dict[str, bool]:
    await call_val(request, "rag.set_rag_host_prompt", rag_host_id, body.text)
    return {"ok": True}
