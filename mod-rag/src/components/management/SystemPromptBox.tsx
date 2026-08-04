// app/components/management/SystemPromptBox.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { getSystemPrompt, saveSystemPrompt } from "@/src/lib/hostContextApi";
import type { RagHostFull } from "@/src/lib/ragHostApi";

type RagHostId = RagHostFull["id"];

export default function SystemPromptBox(props: { hostId: RagHostId }) {
  const { hostId } = props;
  const { isReadOnly } = useAppMode();

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const [loadedText, setLoadedText] = useState("");
  const [text, setText] = useState("");

  const hasChanges = useMemo(() => loadedText !== text, [loadedText, text]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote("");

    try {
      const t = await getSystemPrompt(hostId);
      setLoadedText(t || "");
      setText(t || "");
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
      setLoadedText("");
      setText("");
    } finally {
      setBusy(false);
    }
  }, [hostId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave() {
    if (isReadOnly) {
      setNote("Demo mode is read-only.");
      return;
    }

    setBusy(true);
    setNote("");

    try {
      await saveSystemPrompt(hostId, text);
      setNote("Saved system prompt.");
      await refresh();
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GroupBox title="3) System prompt (host_context)">
      <div className="grid gap-3">
        <div className="text-xs text-gray-600">
          This is the per-host system prompt blob. Prompt chaining can be added later using your
          existing <code className="ml-1">rag.prompt</code> table if you want.
        </div>

        <textarea
          className="min-h-[220px] w-full rounded border px-2 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={isReadOnly}
          disabled={busy}
          placeholder="Enter system prompt..."
        />

        {isReadOnly ? (
          <div className="rounded border bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Demo mode is read-only. You can view this prompt, but edits are disabled.
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!isReadOnly ? (
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => void onSave()}
              disabled={busy || !hasChanges}
              title={!hasChanges ? "No changes" : "Save changes"}
            >
              Save
            </button>
          ) : null}

          <button
            type="button"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={busy}
          >
            Refresh
          </button>
        </div>

        {note ? <div className="whitespace-pre-wrap text-xs text-gray-700">{note}</div> : null}

        <details className="text-xs">
          <summary className="cursor-pointer">Append/ordering options later</summary>

          <div className="mt-2 text-gray-600">
            We can later assemble: system_prompt + context_messages + retrieved docs + prompt rows
            using append, replace, or none.
          </div>
        </details>
      </div>
    </GroupBox>
  );
}