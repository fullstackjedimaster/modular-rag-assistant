// Simple feature-flag resolver for client code.
// Priority: URL param > localStorage > env > default

export function resolveBooleanFlag(opts: {
    urlParam: string;                 // e.g., "aiDock"
    localStorageKey: string;          // e.g., "aiDock"
    envVar?: string;                  // e.g., process.env.NEXT_PUBLIC_AI_DOCK
    defaultValue?: boolean;           // default if none set
}): boolean {
    const { urlParam, localStorageKey, envVar, defaultValue = false } = opts;

    // 1) URL param
    try {
        const usp = new URLSearchParams(window.location.search);
        const raw = usp.get(urlParam);
        if (raw !== null) return truthy(raw);
    } catch {
        /* noop */
    }

    // 2) localStorage
    try {
        const saved = window.localStorage.getItem(localStorageKey);
        if (saved !== null) return truthy(saved);
    } catch {
        /* noop */
    }

    // 3) env (NEXT_PUBLIC_*)
    if (typeof envVar === "string" && envVar.length > 0) {
        return truthy(envVar);
    }

    // 4) default
    return defaultValue;
}

export function storeBooleanFlag(key: string, value: boolean) {
    try {
        window.localStorage.setItem(key, value ? "1" : "0");
    } catch {
        /* noop */
    }
}

function truthy(v: string): boolean {
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
}
