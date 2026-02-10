// /mod-rag/app/lib/messages.ts
// Generic selection message used across hosts (daq-ui, crud-server, etc.)

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export type TargetSelectedMsg = {
    type: "TARGET_SELECTED";
    id: string;           // generic identifier (was "mac")
    attrs?: Attrs | null; // generic telemetry/attributes (was "telemetry")
    usecase?: string | null;
    source?: string;
};

function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`[messages] ${msg}`);
}

// STRICT: only accept TargetSelectedMsg. Everything else is an error.
export function parseSelectionMessage(v: unknown): TargetSelectedMsg {
    assert(v && typeof v === "object", "selection message must be an object.");

    const o = v as Record<string, unknown>;
    assert(o.type === "TARGET_SELECTED", `invalid message type: ${String(o.type)} (expected TARGET_SELECTED).`);
    assert(typeof o.id === "string" && o.id.length > 0, "TARGET_SELECTED.id must be a non-empty string.");

    // attrs is optional, but if present must be an object (or null)
    const attrs = (o.attrs ?? null) as unknown;
    assert(attrs === null || typeof attrs === "object", "TARGET_SELECTED.attrs must be an object or null.");

    const usecase = o.usecase as unknown;
    assert(usecase === undefined || usecase === null || typeof usecase === "string", "TARGET_SELECTED.usecase must be string|null|undefined.");

    const source = o.source as unknown;
    assert(source === undefined || typeof source === "string", "TARGET_SELECTED.source must be string|undefined.");

    return {
        type: "TARGET_SELECTED",
        id: o.id,
        attrs: (o.attrs as Attrs) ?? null,
        usecase: typeof usecase === "string" ? usecase : null,
        source: typeof source === "string" ? source : undefined,
    };
}
