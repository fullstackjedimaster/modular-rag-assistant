export type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Record<string, AttrValue>;

export type RagDockConnectMessage = {
    type: "RAG_DOCK_CONNECT";
    ragClientId: string;
};

export type RagDockDisconnectMessage = {
    type: "RAG_DOCK_DISCONNECT";
};

export type TargetSelectedMessage = {
    type: "TARGET_SELECTED";
    id: string;
    attrs: Attrs;
    source: string;
};

export type HostThemeMessage = {
    type: "HOST_THEME";
    vars: Record<string, string>;
    app: string;
    density: string;
};

export type RagHostDiscoverMessage = {
    type: "RAG_HOST_DISCOVER";
};

export type RagHostReadyMessage = {
    type: "RAG_HOST_READY";
};

export type DockReadyMessage = {
    type: "DOCK_READY";
};

export type DockResizeMessage = {
    type: "DOCK_RESIZE";
    height: number;
};

export function parseTargetSelectedMessage(
    value: unknown,
): TargetSelectedMessage | null {
    const message = value as Partial<TargetSelectedMessage> | null;

    return message?.type === "TARGET_SELECTED" &&
        typeof message.id === "string"
        ? (message as TargetSelectedMessage)
        : null;
}
