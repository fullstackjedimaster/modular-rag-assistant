import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const EMBED_SECRET = process.env.EMBED_SECRET || "";

const ALLOWED_TARGETS = new Set([
    "iot-wireless-mesh-daq",
]);

function sign(payload: object): string {
    const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" })
    ).toString("base64url");

    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const sig = crypto
        .createHmac("sha256", EMBED_SECRET)
        .update(`${header}.${body}`)
        .digest("base64url");

    return `${header}.${body}.${sig}`;
}

export async function GET(req: NextRequest) {
    const target = req.nextUrl.searchParams.get("target") || "";

    if (!EMBED_SECRET || EMBED_SECRET.length < 32) {
        return NextResponse.json(
            { error: "server misconfigured" },
            { status: 500 }
        );
    }

    if (!ALLOWED_TARGETS.has(target)) {
        return NextResponse.json(
            { error: "bad request" },
            { status: 400 }
        );
    }

    const now = Math.floor(Date.now() / 1000);
    const sid = crypto.randomUUID();

    const token = sign({
        iss: "modular-rag-assistant.fullstackjedi.dev",
        aud: target,
        sid,
        iat: now,
        exp: now + 180,
        jti: crypto.randomUUID(),
    });

    return NextResponse.json({ token });
}