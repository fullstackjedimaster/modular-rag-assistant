// /mod-rag/app/dock/Page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SmartExplainer } from "@/app/components/SmartExplainer";
import { useUsecase } from "@/app/hooks/useUseCase";
import { parseSelectionMessage } from "@/app/lib/messages";

type AttrValue = string | number | boolean | null | undefined;
type Attrs = Record<string, AttrValue>;

function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) throw new Error(`[dock] ${msg}`);
}

function requireAllowlist(usecase: any): string[] {
    const keys = usecase?.telemetry_keys;
    assert(Array.isArray(keys), "usecase.telemetry_keys must exist and be an array.");
    assert(keys.length > 0, "usecase.telemetry_keys must be non-empty (no fallbacks).");
    for (const k of keys) assert(typeof k === "string" && k.length > 0, "usecase.telemetry_keys contains an invalid key.");
    return keys as string[];
}

function pickRequiredAttrs(attrs: Attrs, allow: string[]) {
    const out: Record<string, string | number | boolean> = {};
    for (const key of allow) {
        const v = attrs[key];
        assert(v !== null && v !== undefined, `missing required attr "${key}" in TARGET_SELECTED.attrs.`);
        const t = typeof v;
        assert(t === "string" || t === "number" || t === "boolean", `attr "${key}" must be string|number|boolean, got ${t}.`);
        out[key] = v as string | number | boolean;
    }
    return out;
}

export default function DockPage() {
    const params = useSearchParams();
    const forcedUsecase = params.get("usecase") || undefined;

    const { selected, loaded, setSelectedId } = useUsecase();

    const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
    const [attrs, setAttrs] = useState<Attrs>({});

    useEffect(() => {
        if (!loaded) return;
        if (!forcedUsecase) return;
        setSelectedId(forcedUsecase);
    }, [loaded, forcedUsecase, setSelectedId]);

    useEffect(() => {
        const onMsg = (ev: MessageEvent<unknown>) => {
            // STRICT: parseSelectionMessage throws if invalid
            const msg = parseSelectionMessage(ev.data);

            setSubjectId(msg.id);

            // attrs can be null by schema, but if your usecase needs keys it will throw below
            const a = (msg.attrs ?? {}) as Attrs;
            assert(a && typeof a === "object", "TARGET_SELECTED.attrs must be an object when provided.");
            setAttrs(a);
        };

        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);

    const forwardedAttrs = useMemo(() => {
        assert(loaded && selected, "usecase not loaded.");
        const allow = requireAllowlist(selected);
        return pickRequiredAttrs(attrs, allow);
    }, [attrs, loaded, selected]);

    if (!loaded || !selected) return null;

    return (
        <div style={{ margin: 0, padding: 12, background: "transparent" }}>
            <SmartExplainer
                subjectId={subjectId}
                attrs={forwardedAttrs}
                usecase={selected}
                showControls={false}
                showPanel={true}
            />
        </div>
    );
}
