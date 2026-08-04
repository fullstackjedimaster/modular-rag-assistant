import { NextRequest, NextResponse } from "next/server";

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  delegated_aud?: string[];
  sid?: string;
  iat?: number;
  exp?: number;
};

export type EmbedProxyOptions = {
  audience: string;
  publicPaths?: string[];
  issuer?: string;
  sessionSeconds?: number;
};

const TOKEN_COOKIE = "pf_embed_token";
const SID_COOKIE = "pf_embed_sid";

function forbidden(message: string) {
  return new NextResponse(message, {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

function bytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function json<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(bytes(input))) as T;
}

function base64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verify(token: string, audience: string, issuer: string): Promise<JwtPayload> {
  const secret = process.env.EMBED_SECRET ?? "";
  if (secret.length < 32) throw new Error("EMBED_SECRET is missing or too short");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [headerPart, payloadPart, signaturePart] = parts;
  if (json<{ alg?: string }>(headerPart).alg !== "HS256") throw new Error("Invalid algorithm");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  if (base64url(new Uint8Array(signed)) !== signaturePart) throw new Error("Invalid signature");
  const payload = json<JwtPayload>(payloadPart);
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(audience) && !payload.delegated_aud?.includes(audience)) throw new Error("Invalid audience");
  if (payload.iss !== issuer || !payload.sid) throw new Error("Invalid issuer or session");
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now > payload.exp + 30) throw new Error("Token expired");
  return payload;
}

export function createEmbedProxy(options: EmbedProxyOptions) {
  const publicPaths = options.publicPaths ?? [];
  const issuer = options.issuer ?? "portfolio.fullstackjedi.dev";
  const sessionSeconds = options.sessionSeconds ?? 180;

  return async function proxy(request: NextRequest) {
    const enabled = (process.env.EMBED_LOCK_ENABLED ?? "false").toLowerCase() === "true";
    const pathname = request.nextUrl.pathname;
    const isPublic = pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/health" || publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    if (!enabled || isPublic) return NextResponse.next();

    const queryToken = request.nextUrl.searchParams.get("pf_embed_token") ?? "";
    const token = queryToken || request.cookies.get(TOKEN_COOKIE)?.value || "";
    if (!token) return forbidden("This demo is only available from the portfolio.");

    try {
      const payload = await verify(token, options.audience, issuer);
      const cookieSid = request.cookies.get(SID_COOKIE)?.value ?? "";
      if (!queryToken && cookieSid && cookieSid !== payload.sid) return forbidden("Invalid portfolio session.");
      if (!queryToken) return NextResponse.next();

      const clean = request.nextUrl.clone();
      clean.searchParams.delete("pf_embed_token");
      const response = NextResponse.redirect(clean);
      const cookie = { httpOnly: true, secure: true, sameSite: "none" as const, path: "/", maxAge: sessionSeconds };
      response.cookies.set(TOKEN_COOKIE, token, cookie);
      response.cookies.set(SID_COOKIE, payload.sid!, cookie);
      return response;
    } catch (error) {
      console.error("[demo-kit embed lock]", error);
      return forbidden("Invalid or expired portfolio session.");
    }
  };
}
