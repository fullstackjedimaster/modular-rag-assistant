# routers/schemas.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal, Any

from pydantic import BaseModel, Field


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
    id: int
    name: str
    host_url: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ContentDocRow(BaseModel):
    id: int
    doc_name: str
    file_path: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TelemetryMessageRow(BaseModel):
    id: int
    message_name: str
    message_value: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


PromptChainingMode = Literal["append", "replace", "none"]


class PromptRow(BaseModel):
    id: int
    text: str
    chaining_mode: PromptChainingMode = "append"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


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


class PromptIn(BaseModel):
    text: str = Field(..., min_length=1)
    chaining_mode: Optional[PromptChainingMode] = None


# ---------------------------
# Nested client JSON (from rag.get_rag_client_json)
# ---------------------------

class RagClientContext(BaseModel):
    id: int
    content_docs: List[ContentDocRow] = Field(default_factory=list)
    telemetry_messages: List[TelemetryMessageRow] = Field(default_factory=list)
    prompts: List[PromptRow] = Field(default_factory=list)


class RagClientFull(BaseModel):
    id: int
    name: str
    host_url: str
    context: Optional[RagClientContext] = None


# If you ever want a generic passthrough type for JSON blobs:
JsonAny = Any
