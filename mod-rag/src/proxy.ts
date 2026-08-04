import { NextRequest, NextResponse } from "next/server";

const EMBED_SECRET = process.env.EMBED_SECRET || "";
const EXPECTED_AUD = "modular-rag-assistant";
const TOKEN_COOKIE = "pf_embed_token";
const SID_COOKIE = "pf_embed_sid";
const EMBED_LOCK_ENABLED =
    (process.env.EMBED_LOCK_ENABLED || "false").toLowerCase() === "true";
const SESSION_SECONDS = 180;
const SKEW_SECONDS = 30;

type JwtPayload = {
    iss?: string;
    aud?: string | string[];
    delegated_aud?: string[];
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
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function base64UrlToJson<T>(input: string): T {
    return JSON.parse(
        new TextDecoder().decode(base64UrlToBytes(input)),
    ) as T;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function sign(data: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(EMBED_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(data),
    );
    return bytesToBase64Url(new Uint8Array(signature));
}

function permitsAudience(payload: JwtPayload): boolean {
    const direct = Array.isArray(payload.aud)
        ? payload.aud.includes(EXPECTED_AUD)
        : payload.aud === EXPECTED_AUD;

    return direct || payload.delegated_aud?.includes(EXPECTED_AUD) === true;
}

async function verifyToken(token: string): Promise<JwtPayload> {
    if (EMBED_SECRET.length < 32) throw new Error("Invalid EMBED_SECRET");

    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid token format");

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = base64UrlToJson<{ alg?: string }>(headerPart);
    if (header.alg !== "HS256") throw new Error("Invalid token algorithm");

    const expectedSignature = await sign(`${headerPart}.${payloadPart}`);
    if (expectedSignature !== signaturePart) throw new Error("Invalid signature");

    const payload = base64UrlToJson<JwtPayload>(payloadPart);
    if (payload.iss !== "portfolio.fullstackjedi.dev") {
        throw new Error("Invalid issuer");
    }
    if (!permitsAudience(payload)) throw new Error("Invalid audience");
    if (!payload.sid) throw new Error("Missing session id");

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || now > payload.exp + SKEW_SECONDS) {
        throw new Error("Token expired");
    }
    if (typeof payload.iat === "number" && payload.iat > now + SKEW_SECONDS) {
        throw new Error("Invalid issued-at time");
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
        pathname.startsWith("/images/") ||
        pathname === "/dock" ||
        pathname.startsWith("/dock/") ||
        pathname === "/dock-host.js"
    );
}

export async function proxy(request: NextRequest) {
    if (!EMBED_LOCK_ENABLED || isPublicPath(request.nextUrl.pathname)) {
        return NextResponse.next();
    }

    const queryToken = request.nextUrl.searchParams.get("pf_embed_token") || "";
    const cookieToken = request.cookies.get(TOKEN_COOKIE)?.value || "";
    const cookieSid = request.cookies.get(SID_COOKIE)?.value || "";
    const token = queryToken || cookieToken;

    if (!token) return forbidden("This demo is only available from the portfolio.");

    try {
        const payload = await verifyToken(token);
        if (!queryToken && cookieSid && cookieSid !== payload.sid) {
            return forbidden("Invalid portfolio session.");
        }

        if (!queryToken) return NextResponse.next();

        const cleanUrl = request.nextUrl.clone();
        cleanUrl.searchParams.delete("pf_embed_token");
        const response = NextResponse.redirect(cleanUrl);
        const cookieOptions = {
            httpOnly: true,
            secure: true,
            sameSite: "none" as const,
            path: "/",
            maxAge: SESSION_SECONDS,
        };

        response.cookies.set(TOKEN_COOKIE, token, cookieOptions);
        response.cookies.set(SID_COOKIE, payload.sid!, cookieOptions);
        return response;
    } catch (error) {
        console.error("[embed-lock]", error);
        return forbidden("Invalid or expired portfolio session.");
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
