"use client";

import React, { useMemo, useState } from "react";
import GroupBox from "@/app/components/GroupBox";
import type { UsecasesJson, UseCaseConfig } from "@/app/lib/adminApi";

export default function DockInjectionBox(props: {
    usecasesJson: UsecasesJson;
    selectedId: string;
}) {
    const { usecasesJson, selectedId } = props;

    const selected = usecasesJson.usecases[selectedId] as UseCaseConfig;

    const hostApps = useMemo(() => selected.host_apps || [], [selected]);

    const [picked, setPicked] = useState<string>(hostApps[0]?.url || "");
    const [note, setNote] = useState("");

    function injectDock() {
        setNote("");

        // Placeholder: you’ll replace this with your CrossFrameBridge / postMessage contract.
        // For now we just open the host app URL in a new tab.
        if (!picked) {
            setNote("No host app selected.");
            return;
        }
        window.open(picked, "_blank", "noopener,noreferrer");
        setNote("Opened host app. Next step: postMessage to inject dock.");
    }

    return (
        <GroupBox title="5) Dock injection">
            <div className="grid gap-3">
                {hostApps.length === 0 ? (
                    <div className="text-xs text-gray-600">
                        No host apps configured in this usecase yet. Add:
                        <code className="ml-1">host_apps</code> in <code>usecases.json</code>.
                    </div>
                ) : (
                    <>
                        <label className="text-sm font-medium">Select Host App</label>
                        <select
                            className="border rounded px-2 py-2 text-sm"
                            value={picked}
                            onChange={(e) => setPicked(e.target.value)}
                        >
                            {hostApps.map((h) => (
                                <option key={h.url} value={h.url}>
                                    {h.name} — {h.url}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            className="border rounded px-3 py-2 text-sm font-medium"
                            onClick={injectDock}
                        >
                            Inject Dock
                        </button>
                    </>
                )}

                {note ? <div className="text-xs text-gray-700 whitespace-pre-wrap">{note}</div> : null}
            </div>
        </GroupBox>
    );
}
