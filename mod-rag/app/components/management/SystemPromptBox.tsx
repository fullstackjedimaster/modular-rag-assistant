// app/components/management/SystemPromptBox.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import GroupBox from "@/app/components/GroupBox";
import { getSystemPrompt, saveSystemPrompt } from "@/app/lib/clientContextApi";

export default function SystemPromptBox(props: { clientId: string }) {
    const { clientId } = props;

    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");

    const [loadedText, setLoadedText] = useState<string>("");
    const [text, setText] = useState<string>("");

    const hasChanges = useMemo(() => loadedText !== text, [loadedText, text]);

    async function refresh() {
        setBusy(true);
        setNote("");
        try {
            const t = await getSystemPrompt(clientId);
            setLoadedText(t || "");
            setText(t || "");
        } catch (e: unknown) {
            setNote(e instanceof Error ? e.message : String(e));
            setLoadedText("");
            setText("");
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    async function onSave() {
        setBusy(true);
        setNote("");
        try {
            await saveSystemPrompt(clientId, text);
            setNote("Saved system prompt.");
            await refresh();
        } catch (e: unknown) {
            setNote(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <GroupBox title="3) System prompt (client_context)">
            <div className="grid gap-3">
                <div className="text-xs text-gray-600">
                    This is the per-client system prompt blob. Prompt chaining can be added later using your existing
                    <code className="ml-1">rag.prompt</code> table if you want.
                </div>

                <textarea
                    className="w-full border rounded px-2 py-2 text-sm min-h-[220px]"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={busy}
                    placeholder="Enter system prompt..."
                />

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="border rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                        onClick={() => void onSave()}
                        disabled={busy || !hasChanges}
                        title={!hasChanges ? "No changes" : "Save changes"}
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                        onClick={() => void refresh()}
                        disabled={busy}
                    >
                        Refresh
                    </button>
                </div>

                {note ? <div className="text-xs text-gray-700 whitespace-pre-wrap">{note}</div> : null}

                <details className="text-xs">
                    <summary className="cursor-pointer">Append/ordering options (later)</summary>
                    <div className="mt-2 text-gray-600">
                        We can later assemble: system_prompt + context_messages + retrieved docs + prompt rows (append/replace/none).
                    </div>
                </details>
            </div>
        </GroupBox>
    );
}
