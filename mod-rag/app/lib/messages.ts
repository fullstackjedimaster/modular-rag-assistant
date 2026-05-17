// /mod-rag/app/lib/messages.ts

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export type TargetSelectedMessage= {
  type: "TARGET_SELECTED";
  id: string;
  subject_id?: string;
  attrs?: Attrs | null;
  source?: string;
};

export type RagClientSelectedMessage = {
  type: "RAG_CLIENT_SELECTED";
  ragClientId: string;
  hostUrl?: string;
  label?: string;
};

export type RagDockConnectMessage = {
  type: "RAG_DOCK_CONNECT";
  ragClientId: string;
  dockUrl: string;
  hostUrl?: string;
  label?: string;
};

export type RagDockDisconnectMessage = {
  type: "RAG_DOCK_DISCONNECT";
  ragClientId?: string;
};

export type DockMessage =
  | TargetSelectedMessage
  | RagClientSelectedMessage
  | RagDockConnectMessage
  | RagDockDisconnectMessage;

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`[messages] ${msg}`);
}

export function parseSelectionMessage(v: unknown): TargetSelectedMessage {
  assert(v && typeof v === "object", "selection message must be an object.");

  const o = v as Record<string, unknown>;

  assert(
    o.type === "TARGET_SELECTED",
    `invalid message type: ${String(o.type)} (expected TARGET_SELECTED).`
  );

  const id = o.id ?? o.subject_id;

  assert(
    typeof id === "string" && id.length > 0,
    "TARGET_SELECTED.id or subject_id must be a non-empty string."
  );

  const attrs = o.attrs ?? null;

  assert(
    attrs === null || typeof attrs === "object",
    "TARGET_SELECTED.attrs must be an object or null."
  );

  const source = o.source;

  assert(
    source === undefined || typeof source === "string",
    "TARGET_SELECTED.source must be string|undefined."
  );

  return {
    type: "TARGET_SELECTED",
    id,
    subject_id: typeof o.subject_id === "string" ? o.subject_id : id,
    attrs: attrs as Attrs | null,
    source: typeof source === "string" ? source : undefined,
  };
}

export function parseRagClientSelectedMessage(v: unknown): RagClientSelectedMessage {
  assert(v && typeof v === "object", "rag client message must be an object.");

  const o = v as Record<string, unknown>;

  assert(
    o.type === "RAG_CLIENT_SELECTED",
    `invalid message type: ${String(o.type)} (expected RAG_CLIENT_SELECTED).`
  );

  assert(
    typeof o.ragClientId === "string" && o.ragClientId.length > 0,
    "RAG_CLIENT_SELECTED.ragClientId must be a non-empty string."
  );

  return {
    type: "RAG_CLIENT_SELECTED",
    ragClientId: o.ragClientId,
    hostUrl: typeof o.hostUrl === "string" ? o.hostUrl : undefined,
    label: typeof o.label === "string" ? o.label : undefined,
  };
}

export function parseRagDockConnectMessage(v: unknown): RagDockConnectMessage {
  assert(v && typeof v === "object", "dock connect message must be an object.");

  const o = v as Record<string, unknown>;

  assert(
    o.type === "RAG_DOCK_CONNECT",
    `invalid message type: ${String(o.type)} (expected RAG_DOCK_CONNECT).`
  );

  assert(
    typeof o.ragClientId === "string" && o.ragClientId.length > 0,
    "RAG_DOCK_CONNECT.ragClientId must be a non-empty string."
  );

  assert(
    typeof o.dockUrl === "string" && o.dockUrl.length > 0,
    "RAG_DOCK_CONNECT.dockUrl must be a non-empty string."
  );

  return {
    type: "RAG_DOCK_CONNECT",
    ragClientId: o.ragClientId,
    dockUrl: o.dockUrl,
    hostUrl: typeof o.hostUrl === "string" ? o.hostUrl : undefined,
    label: typeof o.label === "string" ? o.label : undefined,
  };
}

export function parseRagDockDisconnectMessage(v: unknown): RagDockDisconnectMessage {
  assert(v && typeof v === "object", "dock disconnect message must be an object.");

  const o = v as Record<string, unknown>;

  assert(
    o.type === "RAG_DOCK_DISCONNECT",
    `invalid message type: ${String(o.type)} (expected RAG_DOCK_DISCONNECT).`
  );

  assert(
    o.ragClientId === undefined || typeof o.ragClientId === "string",
    "RAG_DOCK_DISCONNECT.ragClientId must be string|undefined."
  );

  return {
    type: "RAG_DOCK_DISCONNECT",
    ragClientId: typeof o.ragClientId === "string" ? o.ragClientId : undefined,
  };
}

export function parseDockMessage(v: unknown): DockMessage {
  assert(v && typeof v === "object", "dock message must be an object.");

  const o = v as Record<string, unknown>;

  if (o.type === "TARGET_SELECTED") return parseSelectionMessage(v);
  if (o.type === "RAG_CLIENT_SELECTED") return parseRagClientSelectedMessage(v);
  if (o.type === "RAG_DOCK_CONNECT") return parseRagDockConnectMessage(v);
  if (o.type === "RAG_DOCK_DISCONNECT") return parseRagDockDisconnectMessage(v);

  throw new Error(`[messages] invalid message type: ${String(o.type)}`);
}