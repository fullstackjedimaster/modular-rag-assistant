// app/components/management/ContentDocsBox.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import GroupBox from "@/app/components/GroupBox";
import {
    addContentDoc,
    deleteContentDoc,
    listContentDocs,
    updateContentDoc,
    type ContentDocRow,
} from "@/app/lib/clientContextApi";

export default function ContentDocsBox(props: { clientId: string }) {
    const { clientId } = props;

    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string>("");

    const [rows, setRows] = useState<ContentDocRow[]>([]);
    const [docName, setDocName] = useState("");
    const [filePath, setFilePath] = useState("");

    async function refresh() {
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
    }

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    async function onAdd() {
        setNote("");
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

    async function onSaveRow(docId: string, next: { doc_name: string; file_path: string }) {
        setNote("");
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

    async function onDelete(docId: string) {
        if (!confirm("Delete this content doc?")) return;
        setNote("");
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
                        These are DB rows (doc_name + file_path). Upload plumbing can come later if you want.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-4">
                            <label className="text-xs font-medium">Doc Name</label>
                            <input
                                className="w-full border rounded px-2 py-2 text-sm"
                                value={docName}
                                onChange={(e) => setDocName(e.target.value)}
                                disabled={busy}
                                placeholder="e.g. Mesh Fault Handbook"
                            />
                        </div>
                        <div className="md:col-span-6">
                            <label className="text-xs font-medium">File Path / URL</label>
                            <input
                                className="w-full border rounded px-2 py-2 text-sm font-mono"
                                value={filePath}
                                onChange={(e) => setFilePath(e.target.value)}
                                disabled={busy}
                                placeholder="/config/source_docs/mesh/handbook.md or https://..."
                            />
                        </div>
                        <div className="md:col-span-2 flex items-end">
                            <button
                                type="button"
                                className="w-full border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                onClick={() => void onAdd()}
                                disabled={busy}
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => void refresh()}
                        disabled={busy}
                    >
                        Refresh
                    </button>
                    {note ? <div className="text-xs text-gray-700 whitespace-pre-wrap">{note}</div> : null}
                </div>

                <div className="border rounded p-2">
                    {rows.length === 0 ? (
                        <div className="text-xs text-gray-500">No content docs configured yet.</div>
                    ) : (
                        <div className="grid gap-2">
                            {rows.map((r) => (
                                <EditableDocRow
                                    key={r.id}
                                    row={r}
                                    busy={busy}
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
    onSave: (next: { doc_name: string; file_path: string }) => void;
    onDelete: () => void;
}) {
    const { row, busy, onSave, onDelete } = props;

    // Uncontrolled inputs + refs: avoids syncing state in effects entirely.
    const nameRef = useRef<HTMLInputElement | null>(null);
    const pathRef = useRef<HTMLInputElement | null>(null);

    function readValues() {
        const doc_name = (nameRef.current?.value || "").trim();
        const file_path = (pathRef.current?.value || "").trim();
        return { doc_name, file_path };
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
            <div className="md:col-span-4">
                <label className="text-xs font-medium">Doc Name</label>
                <input
                    ref={nameRef}
                    className="w-full border rounded px-2 py-1 text-sm"
                    defaultValue={row.doc_name}
                    disabled={busy}
                />
            </div>
            <div className="md:col-span-7">
                <label className="text-xs font-medium">File Path / URL</label>
                <input
                    ref={pathRef}
                    className="w-full border rounded px-2 py-1 text-sm font-mono"
                    defaultValue={row.file_path}
                    disabled={busy}
                />
            </div>
            <div className="md:col-span-1 flex md:justify-end gap-2 mt-5 md:mt-6">
                <button
                    type="button"
                    className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onSave(readValues())}
                    title="Save"
                >
                    Save
                </button>
                <button
                    type="button"
                    className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                    disabled={busy}
                    onClick={onDelete}
                    title="Delete"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
