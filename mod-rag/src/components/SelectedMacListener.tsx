// /ui-daq/src/ai/components/SelectedMacListener.tsx


import { useEffect } from "react";

export type PanelTelemetry = {
    voltage?: string;
    current?: string;
    // status?: string;
};

type Props = {
    setMac: (mac: string) => void;
    setTelemetry: (t: PanelTelemetry) => void;
    query: string;
    setQueryAction: (q: string) => void;
};

// Runtime type guard for messages we care about
function isSetSelectedMessage(
    v: unknown
): v is { type: "SET_SELECTED"; mac: string; telemetry?: PanelTelemetry | null } {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return o.type === "SET_SELECTED" && typeof o.mac === "string";
}

export default function SelectedMacListener({ setMac, setTelemetry, query, setQueryAction }: Props) {
    useEffect(() => {
        const onMsg = (ev: MessageEvent<unknown>) => {
            const d = ev.data;
            if (!isSetSelectedMessage(d)) return;

            // Safe to access now
            console.log("[ui-daq] received SET_SELECTED:", d);

            setMac(d.mac);
            if (!query) setQueryAction(`Explain current status for panel ${d.mac}.`);

            if (d.telemetry && typeof d.telemetry === "object") {
                const t = d.telemetry as PanelTelemetry;
                setTelemetry({
                    // status: t.status !== undefined ? String(t.status) : undefined,
                    voltage: t.voltage !== undefined ? String(t.voltage) : undefined,
                    current: t.current !== undefined ? String(t.current) : undefined,
                });
            }
        };

        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, [setMac, setTelemetry, query, setQueryAction]);

    return null;
}
