// app/components/management/ContentDocsBox.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import {
  addContentDoc,
  deleteContentDoc,
  listContentDocs,
  updateContentDoc,
  type ContentDocRow,
} from "@/src/lib/clientContextApi";
import type { RagClientFull } from "@/src/lib/ragClientApi";

type RagClientId = RagClientFull["id"];
type ContentDocId = ContentDocRow["id"];

export default function ContentDocsBox(props: { clientId: RagClientId }) {
  const { clientId } = props;
  const { isReadOnly } = useAppMode();

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const [rows, setRows] = useState<ContentDocRow[]>([]);
  const [docName, setDocName] = useState("");
  const [filePath, setFilePath] = useState("");

  const refresh = useCallback(async () => {
    setNote("");
    setBusy(true);

    try {
      const list = await listContentDocs(clientId);
      setRows(list || []);
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAdd() {
    setNote("");

    if (isReadOnly) {
      setNote("Demo mode is read-only. Adding content docs is disabled.");
      return;
    }

    const dn = docName.trim();
    const fp = filePath.trim();

    if (!dn) {
      setNote("doc_name is required.");
      return;
    }

    if (!fp) {
      setNote("file_path is required.");
      return;
    }

    setBusy(true);

    try {
      await addContentDoc(clientId, { doc_name: dn, file_path: fp });
      setDocName("");
      setFilePath("");
      await refresh();
      setNote("Added content doc.");
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRow(docId: ContentDocId, next: { doc_name: string; file_path: string }) {
    setNote("");

    if (isReadOnly) {
      setNote("Demo mode is read-only. Saving content docs is disabled.");
      return;
    }

    setBusy(true);

    try {
      await updateContentDoc(clientId, docId, {
        doc_name: next.doc_name.trim(),
        file_path: next.file_path.trim(),
      });

      await refresh();
      setNote("Saved.");
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(docId: ContentDocId) {
    setNote("");

    if (isReadOnly) {
      setNote("Demo mode is read-only. Deleting content docs is disabled.");
      return;
    }

    if (!confirm("Delete this content doc?")) return;
    setBusy(true);

    try {
      await deleteContentDoc(clientId, docId);
      await refresh();
      setNote("Deleted.");
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GroupBox title="1) Content docs (client_context)">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <div className="text-xs text-gray-600">
            These are DB rows, doc_name + file_path. Upload plumbing can come later if you want.
          </div>

          {isReadOnly ? (
            <div className="rounded border bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Demo mode is read-only. You can view content docs, but edits are disabled.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className="text-xs font-medium">Doc Name</label>
              <input
                className="w-full rounded border px-2 py-2 text-sm"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                disabled={busy || isReadOnly}
                placeholder="e.g. Mesh Fault Handbook"
              />
            </div>

            <div className="md:col-span-6">
              <label className="text-xs font-medium">File Path / URL</label>
              <input
                className="w-full rounded border px-2 py-2 font-mono text-sm"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                disabled={busy || isReadOnly}
                placeholder="/config/source_docs/mesh/handbook.md or https://..."
              />
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                type="button"
                className="w-full rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => void onAdd()}
                disabled={busy || isReadOnly}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={busy}
          >
            Refresh
          </button>

          {note ? <div className="whitespace-pre-wrap text-xs text-gray-700">{note}</div> : null}
        </div>

        <div className="rounded border p-2">
          {rows.length === 0 ? (
            <div className="text-xs text-gray-500">No content docs configured yet.</div>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => (
                <EditableDocRow
                  key={r.id}
                  row={r}
                  busy={busy}
                  isReadOnly={isReadOnly}
                  onSave={(next) => void onSaveRow(r.id, next)}
                  onDelete={() => void onDelete(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </GroupBox>
  );
}

function EditableDocRow(props: {
  row: ContentDocRow;
  busy: boolean;
  isReadOnly: boolean;
  onSave: (next: { doc_name: string; file_path: string }) => void;
  onDelete: () => void;
}) {
  const { row, busy, isReadOnly, onSave, onDelete } = props;

  const nameRef = useRef<HTMLInputElement | null>(null);
  const pathRef = useRef<HTMLInputElement | null>(null);

  function readValues() {
    const doc_name = (nameRef.current?.value || "").trim();
    const file_path = (pathRef.current?.value || "").trim();

    return { doc_name, file_path };
  }

  return (
    <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-12">
      <div className="md:col-span-4">
        <label className="text-xs font-medium">Doc Name</label>
        <input
          ref={nameRef}
          className="w-full rounded border px-2 py-1 text-sm"
          defaultValue={row.doc_name}
          disabled={busy || isReadOnly}
        />
      </div>

      <div className="md:col-span-7">
        <label className="text-xs font-medium">File Path / URL</label>
        <input
          ref={pathRef}
          className="w-full rounded border px-2 py-1 font-mono text-sm"
          defaultValue={row.file_path}
          disabled={busy || isReadOnly}
        />
      </div>

      <div className="mt-5 flex gap-2 md:col-span-1 md:mt-6 md:justify-end">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={busy || isReadOnly}
          onClick={() => onSave(readValues())}
          title="Save"
        >
          Save
        </button>

        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={busy || isReadOnly}
          onClick={onDelete}
          title="Delete"
        >
          Delete
        </button>
      </div>
    </div>
  );
}