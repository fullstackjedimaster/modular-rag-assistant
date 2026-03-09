// /mod-rag/app/lib/messages.ts

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export type TargetSelectedMsg = {
  type: "TARGET_SELECTED";
  id: string;
  attrs?: Attrs | null;
  source?: string;
};

export type RagClientSelectedMsg = {
  type: "RAG_CLIENT_SELECTED";
  client: string;
  hostUrl?: string;
  label?: string;
  defaultUsecase?: string | null;
};

export type DockMessage = TargetSelectedMsg | RagClientSelectedMsg;

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`[messages] ${msg}`);
}

export function parseSelectionMessage(v: unknown): TargetSelectedMsg {
  assert(v && typeof v === "object", "selection message must be an object.");

  const o = v as Record<string, unknown>;
  assert(
    o.type === "TARGET_SELECTED",
    `invalid message type: ${String(o.type)} (expected TARGET_SELECTED).`
  );
  assert(
    typeof o.id === "string" && o.id.length > 0,
    "TARGET_SELECTED.id must be a non-empty string."
  );

  const attrs = (o.attrs ?? null) as unknown;
  assert(attrs === null || typeof attrs === "object", "TARGET_SELECTED.attrs must be an object or null.");

  const source = o.source as unknown;
  assert(source === undefined || typeof source === "string", "TARGET_SELECTED.source must be string|undefined.");

  return {
    type: "TARGET_SELECTED",
    id: o.id,
    attrs: (o.attrs as Attrs) ?? null,
    source: typeof source === "string" ? source : undefined,
  };
}

export function parseRagClientSelectedMessage(v: unknown): RagClientSelectedMsg {
  assert(v && typeof v === "object", "rag client message must be an object.");

  const o = v as Record<string, unknown>;
  assert(
    o.type === "RAG_CLIENT_SELECTED",
    `invalid message type: ${String(o.type)} (expected RAG_CLIENT_SELECTED).`
  );
  assert(
    typeof o.client === "string" && o.client.length > 0,
    "RAG_CLIENT_SELECTED.client must be a non-empty string."
  );

  const hostUrl = o.hostUrl as unknown;
  assert(
    hostUrl === undefined || typeof hostUrl === "string",
    "RAG_CLIENT_SELECTED.hostUrl must be string|undefined."
  );

  const label = o.label as unknown;
  assert(
    label === undefined || typeof label === "string",
    "RAG_CLIENT_SELECTED.label must be string|undefined."
  );

  const defaultUsecase = o.defaultUsecase as unknown;
  assert(
    defaultUsecase === undefined || defaultUsecase === null || typeof defaultUsecase === "string",
    "RAG_CLIENT_SELECTED.defaultUsecase must be string|null|undefined."
  );

  return {
    type: "RAG_CLIENT_SELECTED",
    client: o.client,
    hostUrl: typeof hostUrl === "string" ? hostUrl : undefined,
    label: typeof label === "string" ? label : undefined,
    defaultUsecase: typeof defaultUsecase === "string" ? defaultUsecase : null,
  };
}

export function parseDockMessage(v: unknown): DockMessage {
  assert(v && typeof v === "object", "dock message must be an object.");

  const o = v as Record<string, unknown>;
  if (o.type === "TARGET_SELECTED") {
    return parseSelectionMessage(v);
  }
  if (o.type === "RAG_CLIENT_SELECTED") {
    return parseRagClientSelectedMessage(v);
  }

  throw new Error(`[messages] invalid message type: ${String(o.type)}`);
}
