// daq-ui/src/middleware.ts
import env from "@/src/lib/settings"

import { NextRequest, NextResponse } from "next/server";

const EMBED_SECRET = env.EMBED_SECRET || "";
const EXPECTED_AUD = "modular-rag-assistant";

const TOKEN_COOKIE = "embed_token";
const SID_COOKIE = "embed_sid";

const EMBED_LOCK_ENABLED =
    (env.EMBED_LOCK_ENABLED || "true").toLowerCase() === "true";

const SESSION_SECONDS = 180;
const SKEW_SECONDS = 30;

type JwtPayload = {
    iss?: string;
    aud?: string;
    sid?: string;
    iat?: number;
    exp?: number;
    jti?: string;
};

function forbidden(message = "Not found") {
    return new NextResponse(message, {
        status: 404,
        headers: {
            "content-type": "text/plain; charset=utf-8",
            "x-robots-tag": "noindex",
        },
    });
}

function base64UrlToBytes(input: string): Uint8Array {
    const padded =
        input.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (input.length % 4)) % 4);

    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
    }

    return bytes;
}

function base64UrlToJson<T>(input: string): T {
    const bytes = base64UrlToBytes(input);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";

    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function hmacSha256Base64Url(
    data: string,
    secret: string
): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(data)
    );

    return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyToken(token: string): Promise<JwtPayload> {
    if (!EMBED_SECRET || EMBED_SECRET.length < 32) {
        throw new Error("EMBED_SECRET is missing or too short");
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid token format");
    }

    const [headerB64, payloadB64, sigB64] = parts;

    const header = base64UrlToJson<{ alg?: string; typ?: string }>(headerB64);
    if (header.alg !== "HS256") {
        throw new Error("Invalid token alg");
    }

    const expected = await hmacSha256Base64Url(
        `${headerB64}.${payloadB64}`,
        EMBED_SECRET
    );

    if (expected !== sigB64) {
        throw new Error("Invalid token signature");
    }

    const payload = base64UrlToJson<JwtPayload>(payloadB64);

    if (payload.aud !== EXPECTED_AUD) {
        throw new Error("Invalid token audience");
    }

    if (!payload.sid) {
        throw new Error("Missing token sid");
    }

    const now = Math.floor(Date.now() / 1000);

    if (typeof payload.exp !== "number") {
        throw new Error("Missing token exp");
    }

    if (now > payload.exp + SKEW_SECONDS) {
        throw new Error("Token expired");
    }

    if (typeof payload.iat === "number" && payload.iat > now + SKEW_SECONDS) {
        throw new Error("Invalid token iat");
    }

    return payload;
}

function isPublicPath(pathname: string): boolean {
    return (
        pathname === "/health" ||
        pathname === "/favicon.ico" ||
        pathname === "/robots.txt" ||
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/images/")
    );
}

export async function proxy(req: NextRequest) {
    console.log("[middleware]", req.method, req.nextUrl.pathname);

    if (!EMBED_LOCK_ENABLED) {
        console.log("[middleware] lock off");
        return NextResponse.next();
    }

    const { pathname } = req.nextUrl;

    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    const queryToken = req.nextUrl.searchParams.get("embed_token") || "";
    const cookieToken = req.cookies.get(TOKEN_COOKIE)?.value || "";
    const cookieSid = req.cookies.get(SID_COOKIE)?.value || "";

    const token = queryToken || cookieToken;

    if (!token) {
        return forbidden("This demo is only available from the portfolio.");
    }

    try {
        const payload = await verifyToken(token);
        const sid = payload.sid;

        if (!sid) {
            return forbidden("Invalid portfolio session.");
        }

        if (!queryToken && cookieSid && cookieSid !== sid) {
            return forbidden("Invalid portfolio session.");
        }

        if (queryToken) {
            const cleanUrl = req.nextUrl.clone();

            cleanUrl.searchParams.delete("embed_token");

            const res = NextResponse.redirect(cleanUrl);

            res.cookies.set(TOKEN_COOKIE, token, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                path: "/",
                maxAge: SESSION_SECONDS,
            });

            res.cookies.set(SID_COOKIE, sid, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                path: "/",
                maxAge: SESSION_SECONDS,
            });

            return res;
        }

        return NextResponse.next();
    } catch (e) {
        console.error("[middleware verifyToken]", e);
        return forbidden("Invalid or expired portfolio session.");
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};