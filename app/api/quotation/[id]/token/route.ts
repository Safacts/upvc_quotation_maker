import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-client";
import { requireTier } from "@/lib/tiers";

// MUST stay byte-identical to the derivation in `../route.ts`, and MUST NOT
// fall back to a literal. The old `|| "dev-secret"` meant that if the env var
// was ever missing this route would happily MINT share tokens from a public,
// hard-coded string — forgeable by anyone reading the repo — while the
// verifying route (which has no such literal) fails closed and rejects them.
// Fail closed here too: no secret, no token.
const TOKEN_SECRET = process.env.QUOTE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function mintToken(quotationId: string): string {
  return createHmac("sha256", TOKEN_SECRET).update(quotationId).digest("hex").slice(0, 16);
}

/**
 * Constant-time string compare.
 *
 * `a === b` on a password hash leaks the length of the matching prefix through
 * timing. These are SHA-256 hex digests over the network, so the practical risk
 * is low — but this is a credential check on a public endpoint and there is no
 * reason to write the sloppy version.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Resolve the caller to a client_id, or return null.
 *
 * TWO accepted proofs of identity, because there are TWO kinds of caller:
 *
 *  1. The WEB portal — an HttpOnly `session` cookie (role `customer`). This is
 *     what the original GET-only implementation supported.
 *
 *  2. The FLUTTER app (Android APK / installed PWA) — which has NO web session
 *     cookie. It authenticates the way it already authenticates against
 *     `/api/save_client`: by presenting `client_id` + the SHA-256
 *     `password_hash` it stored at login (`session_password_hash`, falling back
 *     to `portalPasswordHash` from the bundled client config).
 *
 * ROOT CAUSE THIS FIXES (verified 09-08-2026): the route used to require (1)
 * unconditionally. The Flutter app has no such cookie, so every share attempt
 * from mobile got 401 -> `_fetchQuoteToken` swallowed it and returned "" ->
 * the WhatsApp message carried `...?token=` -> the customer's browser hit the
 * public route with an empty token -> 403 "Invalid or missing token".
 * The share link has therefore been broken for every mobile user.
 *
 * NOTE: we deliberately do NOT accept a bare `client_id` with no secret. That
 * would let anyone who can guess a tenant slug mint share tokens for that
 * tenant's entire quotation history.
 */
async function resolveCaller(
  body: Record<string, any> | null,
): Promise<{ clientId: string } | null> {
  // (1) Web session cookie.
  const session = await getSession();
  if (session && session.role === "customer" && session.client_id) {
    return { clientId: String(session.client_id) };
  }

  // (2) Flutter: client_id + password hash.
  if (!body) return null;
  const clientId = String(body.client_id ?? body.clientId ?? "").trim();
  // `admin_password_hash` is the field name `/api/save_client` already uses;
  // accept both so the Dart side has one consistent payload shape.
  const phash = String(body.admin_password_hash ?? body.password_hash ?? "").trim();
  if (!clientId || !phash) return null;

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id,password_hash")
    .eq("id", clientId)
    .single();

  if (error || !client || !client.password_hash) return null;
  if (!safeEqual(String(client.password_hash), phash)) return null;

  return { clientId: String(client.id) };
}

/**
 * Mint a share token for `id`, but ONLY for a caller who owns the quotation.
 *
 * The token itself is an HMAC over the quotation id, so it is not a secret we
 * are "granting" so much as one we are proving the caller is entitled to see.
 * Ownership is re-checked against the database on every call — never trusted
 * from the request.
 */
async function issue(id: string, body: Record<string, any> | null) {
  if (!TOKEN_SECRET) {
    return json({ error: "Share links are not configured" }, 503);
  }

  const caller = await resolveCaller(body);
  if (!caller) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: quotation, error } = await supabaseAdmin
    .from("quotations")
    .select("client_id")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return json({ error: "Quotation not found" }, 404);
  }

  if (quotation.client_id !== caller.clientId) {
    return json({ error: "Forbidden" }, 403);
  }

  // TIER GATE — token-gated share links are the Rs.45,000 `nextplus` feature.
  //
  // This is checked AFTER ownership on purpose. Reversing the order would turn
  // this endpoint into an oracle: a caller could distinguish "that quotation
  // exists but belongs to someone else" (403) from "your plan is too low" (402)
  // and enumerate other tenants' quotation ids.
  const paid = await requireTier(caller.clientId, "whatsapp_share");
  if (!paid.ok) return paid.error;

  return json({ token: mintToken(id) }, 200);
}

/** Web portal path — authenticated by the HttpOnly session cookie. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await issue(id, null);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

/** Flutter path — authenticated by client_id + password hash (or the cookie). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    return await issue(id, body);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
