// src/hooks/useEmbedToken.ts
'use client';

import { useEffect, useState } from 'react';

export function useEmbedToken() {
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        function handleMessage(ev: MessageEvent) {
            const data = ev.data;
            if (
                data &&
                typeof data === 'object' &&
                data.kind === 'portfolio-embed-token' &&
                typeof data.token === 'string'
            ) {
                setToken(data.token);
            }
        }

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return token;
}
