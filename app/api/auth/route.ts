import { Errors, createClient } from "@farcaster/quick-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // optional but recommended for speed
export const dynamic = "force-dynamic";

const client = createClient();

// Use your known domain here:
const DOMAIN = "pizzaparty-zeta.vercel.app";

// Small helper for consistent JSON + CORS
function json(data: unknown, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === "number" ? { status: init } : init ?? {};
  const headers = new Headers(base.headers);
  headers.set("content-type", "application/json");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  return NextResponse.json(data, { ...base, headers });
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true }, 200);
}

export async function GET(request: NextRequest) {
  const auth =
    request.headers.get("authorization") ??
    request.headers.get("Authorization") ??
    "";

  if (!auth.startsWith("Bearer ")) {
    return json({ message: "Missing token" }, 401);
  }

  const token = auth.slice("Bearer ".length).trim();

  try {
    // Verify the Quick Auth JWT against your fixed domain
    const payload = await client.verifyJwt({
      token,
      domain: DOMAIN,
    });

    return json({
      success: true,
      user: {
        fid: payload.sub,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      },
    });
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return json({ message: "Invalid token" }, 401);
    }
    return json({ message: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
}