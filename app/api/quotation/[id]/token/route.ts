import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import { requireTier } from "@/lib/tiers";
import {
  createQuotationToken,
  hashQuotationToken,
  quotationTokenExpiry,
} from "@/lib/quotation-token";

// MUST stay byte-identical to the derivation in `../route.ts`, and MUST NOT
// fall back to a literal. The old `|| "dev-secret"` meant that if the env var
// was ever missing this route would happily MINT share tokens from a public,
// hard-coded string — forgeable by anyone reading the repo — while the
// verifying route (which has no such literal) fails closed and rejects them.
// Fail closed here too: no secret, no token.
const PROD_ORIGIN = "https://app.vitharn.com";
const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

function getCorsHeaders(request?: NextRequest): Record<string, string> {
  const origin = request?.headers.get("origin");
  const allowOrigin =
    origin && (DEV_ORIGINS.has(origin) || origin === PROD_ORIGIN)
      ? origin
      : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-client-id",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, request?: NextRequest) {
  return NextResponse.json(data, { status, headers: getCorsHeaders(request) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

/**
 * Constant-time string compare.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Resolve the caller to a client_id, or return null.
 */
async function resolveCaller(
  body: Record<string, any> | null,
  request?: NextRequest,
): Promise<{ clientId: string } | null> {
  try {
    // (1) Web session cookie.
    const session = await getSession();
    const roleOk =
      !!session && (session.role === "customer" || session.role === "admin");
    if (roleOk) {
      const sessionClientId = session!.client_id
        ? String(session!.client_id)
        : String(body?.client_id ?? body?.clientId ?? request?.headers.get("x-client-id") ?? "").trim();
      if (sessionClientId) {
        return { clientId: sessionClientId };
      }
    }

    // (2) Flutter: client_id + password hash.
    const clientId = String(
      body?.client_id ?? body?.clientId ?? request?.headers.get("x-client-id") ?? ""
    ).trim();
    const phash = String(body?.admin_password_hash ?? body?.password_hash ?? "").trim();
    if (!clientId) return null;

    const supabaseAdmin = getSupabaseAdmin();

    // (2a) Platform-admin credential
    const adminEmail = String(body?.admin_email ?? body?.email ?? "")
      .trim()
      .toLowerCase();
    if (adminEmail && phash) {
      const { data: admins } = await supabaseAdmin
        .from("admins")
        .select("email,password_hash")
        .eq("email", adminEmail)
        .limit(1);
      const admin = Array.isArray(admins) ? admins[0] : null;
      if (admin?.password_hash && safeEqual(String(admin.password_hash), phash)) {
        return { clientId };
      }
    }

    // (2b) Tenant credential
    if (phash) {
      let { data: client } = await supabaseAdmin
        .from("clients")
        .select("id,password_hash")
        .eq("id", clientId)
        .maybeSingle();

      if (!client) {
        const { data: matched } = await supabaseAdmin
          .from("clients")
          .select("id,password_hash")
          .ilike("id", clientId)
          .limit(1);
        client = matched?.[0];
      }

      if (client?.password_hash && safeEqual(String(client.password_hash), phash)) {
        return { clientId: String(client.id) };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Mint a share token for `id`, but ONLY for a caller who owns the quotation.
 */
async function issue(id: string, body: Record<string, any> | null, request?: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const caller = await resolveCaller(body, request);
  if (!caller) {
    return json({ error: "Unauthorized" }, 401, request);
  }

  const { data: quotation, error } = await supabaseAdmin
    .from("quotations")
    .select("client_id")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return json({ error: "Quotation not found" }, 404, request);
  }

  if (quotation.client_id?.toLowerCase() !== caller.clientId.toLowerCase()) {
    return json({ error: "Forbidden" }, 403, request);
  }

  // TIER GATE — token-gated share links are the Rs.45,000 `nextplus` feature.
  //
  // This is checked AFTER ownership on purpose. Reversing the order would turn
  // this endpoint into an oracle: a caller could distinguish "that quotation
  // exists but belongs to someone else" (403) from "your plan is too low" (402)
  // and enumerate other tenants' quotation ids.
  const paid = await requireTier(caller.clientId, "whatsapp_share");
  if (!paid.ok) return paid.error;

  const token = createQuotationToken();
  const { data: stored, error: storeError } = await supabaseAdmin
    .from("quotation_share_tokens")
    .insert({
      quotation_id: id,
      client_id: caller.clientId,
      token_hash: hashQuotationToken(token),
      expires_at: quotationTokenExpiry(),
    })
    .select("expires_at")
    .single();

  if (storeError || !stored) {
    return json({ error: "Failed to create share link" }, 500, request);
  }

  return json({ token, expires_at: stored.expires_at }, 200, request);
}

/** Web portal path — authenticated by the HttpOnly session cookie. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await issue(id, null, req);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500, req);
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
      return json({ error: "Invalid JSON" }, 400, req);
    }
    return await issue(id, body, req);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500, req);
  }
}
