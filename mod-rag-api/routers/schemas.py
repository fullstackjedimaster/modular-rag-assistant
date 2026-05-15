# routers/schemas.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal, Any

from pydantic import BaseModel, Field

from uuid import UUID

# ---------------------------
# Runtime status
# ---------------------------

class RagClientStatus(BaseModel):
    connected: bool = False
    detail: str = ""
    last_seen_at: Optional[str] = None  # ISO string


class ConnectResponse(BaseModel):
    ok: bool
    detail: str = ""


# ---------------------------
# DB rows
# ---------------------------

class RagClientRow(BaseModel):
    id: UUID
    name: str
    host_url: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ContentDocRow(BaseModel):
    id: UUID
    doc_name: str
    file_path: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TelemetryMessageRow(BaseModel):
    id: UUID
    message_name: str
    message_value: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

PromptChainingMode = Literal["append","replace","none"]





# ---------------------------
# Input models
# ---------------------------

class CreateRagClientIn(BaseModel):
    name: str = Field(..., min_length=1)
    host_url: str = Field(..., min_length=1)


class UpdateRagClientIn(BaseModel):
    name: str = Field(..., min_length=1)
    host_url: str = Field(..., min_length=1)


class ContentDocIn(BaseModel):
    doc_name: str = Field(..., min_length=1)
    file_path: str = Field(..., min_length=1)


class TelemetryMessageIn(BaseModel):
    message_name: str = Field(..., min_length=1)
    message_value: str = Field(..., min_length=1)


# ---------------------------
# Nested client JSON (from rag.get_rag_client_json)
# ---------------------------


class RagClientFull(BaseModel):
    id: UUID
    name: str
    host_url: str
    collection:str
    llm_model: str
    embed_model: str
    prompt: str
    chaining_mode: PromptChainingMode
    telemetry_messages: List[TelemetryMessageRow] = Field(default_factory=list)

# If you ever want a generic passthrough type for JSON blobs:
JsonAny = Any



