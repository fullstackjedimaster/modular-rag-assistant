"use client";

import React, { useCallback, useEffect, useState } from "react";

import GroupBox from "@/src/components/GroupBox";
import { useAppMode } from "@/src/contexts/AppModeContext";
import {
    getContextMessages,
    saveContextMessages,
    type ContextMessageRow,
} from "@/src/lib/hostContextApi";

const EMPTY_ROW: ContextMessageRow = { name: "", value: "" };

export default function ContextMessagesBox(props: { hostId: string }) {
    const { hostId } = props;
    const { isReadOnly } = useAppMode();
    const [rows, setRows] = useState<ContextMessageRow[]>([]);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");

    const refresh = useCallback(async () => {
        setBusy(true);
        setNote("");
        try {
            setRows(await getContextMessages(hostId));
        } catch (error: unknown) {
            setRows([]);
            setNote(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }, [hostId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    function updateRow(index: number, patch: Partial<ContextMessageRow>) {
        setRows((current) =>
            current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, ...patch } : row,
            ),
        );
    }

    function removeRow(index: number) {
        setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    }

    async function save() {
        if (isReadOnly) {
            setNote("Demo mode is read-only.");
            return;
        }

        const normalized = rows
            .map((row) => ({ name: row.name.trim(), value: row.value.trim() }))
            .filter((row) => row.name.length > 0);

        setBusy(true);
        setNote("");
        try {
            await saveContextMessages(hostId, normalized);
            setNote("Saved context messages.");
            await refresh();
        } catch (error: unknown) {
            setNote(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <GroupBox title="2) Context telemetry">
            <div className="grid gap-3">
                <p className="text-xs text-gray-600">
                    Choose the telemetry fields the host may send to the dock. These rows are stored in
                    <code className="ml-1">rag.telemetry_message</code>.
                </p>

                <div className="grid gap-2">
                    {rows.length === 0 ? (
                        <div className="rounded border px-3 py-3 text-xs text-gray-500">
                            No context telemetry configured. Add the first field below.
                        </div>
                    ) : null}

                    {rows.map((row, index) => (
                        <div key={row.id || `${index}-${row.name}`} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <input
                                className="rounded border px-2 py-2 text-sm md:col-span-4"
                                value={row.name}
                                onChange={(event) => updateRow(index, { name: event.target.value })}
                                placeholder="e.g. irradiance"
                                disabled={busy || isReadOnly}
                            />
                            <input
                                className="rounded border px-2 py-2 text-sm md:col-span-7"
                                value={row.value}
                                onChange={(event) => updateRow(index, { value: event.target.value })}
                                placeholder="Default/example value"
                                disabled={busy || isReadOnly}
                            />
                            <button
                                type="button"
                                className="rounded border px-2 py-2 text-sm md:col-span-1"
                                onClick={() => removeRow(index)}
                                disabled={busy || isReadOnly}
                                aria-label={`Remove ${row.name || "context field"}`}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    {!isReadOnly ? (
                        <>
                            <button
                                type="button"
                                className="rounded border px-3 py-2 text-sm"
                                onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
                                disabled={busy}
                            >
                                Add Field
                            </button>
                            <button
                                type="button"
                                className="rounded border px-3 py-2 text-sm font-medium"
                                onClick={() => void save()}
                                disabled={busy}
                            >
                                Save
                            </button>
                        </>
                    ) : null}
                    <button
                        type="button"
                        className="rounded border px-3 py-2 text-sm"
                        onClick={() => void refresh()}
                        disabled={busy}
                    >
                        Refresh
                    </button>
                </div>

                {note ? <div className="whitespace-pre-wrap text-xs text-gray-700">{note}</div> : null}
            </div>
        </GroupBox>
    );
}
