import { NextRequest, NextResponse } from "next/server";
import { supaGet, supabaseRpc } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { requireTier } from "@/lib/tiers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-client-id",
} as const;

/**
 * GET /api/content/manifest
 *
 * Returns the content manifest for a client. The Flutter app uses this to
 * determine what content has changed since its last sync.
 *
 * Query params:
 *   client_id — required, the client's unique identifier
 *
 * Response:
 *   {
 *     "client_id": "venkateshwara",
 *     "manifest": [
 *       {
 *         "content_type": "products",
 *         "version": 5,
 *         "last_modified": "2026-08-09T10:30:00Z",
 *         "checksum": "abc123...",
 *         "item_count": 42
 *       },
 *       ...
 *     ]
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);

    // AUTH + TENANT + TIER, identical to the paired `/api/content/sync` route
    // and for the same reason: `client_id` was read from the query string and
    // queried with the service-role key (RLS bypassed), so the version/checksum
    // manifest of any tenant was readable by anyone who guessed a slug. That is
    // a map of another company's catalogue and update cadence.
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    const t = resolveTenant(session, url.searchParams.get("client_id"));
    if (!t.ok) {
      return NextResponse.json(
        { error: t.error },
        { status: t.status, headers: CORS_HEADERS },
      );
    }
    const clientId = t.clientId;

    // Gated at `cloud_sync` (`base`), matching `/api/content/sync`. Gating the
    // manifest differently from the delta it describes would let a tenant see
    // that content changed and then be refused the content itself.
    if (!t.isAdmin) {
      const paid = await requireTier(clientId, "cloud_sync");
      if (!paid.ok) {
        return NextResponse.json(await paid.error.json(), {
          status: paid.error.status,
          headers: CORS_HEADERS,
        });
      }
    }

    // Fetch all manifest rows for this client.
    // If the table doesn't exist yet (migration 014 not applied), degrade
    // gracefully: return an empty manifest instead of 500. The Flutter app
    // treats an empty manifest as "nothing to sync".
    let items: any[] = [];
    try {
      const manifest = await supaGet("content_manifest", {
        client_id: "eq." + clientId,
        select: "content_type,version,last_modified,checksum,item_count",
        order: "content_type.asc",
      });
      items = Array.isArray(manifest) ? manifest : [];
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("PGRST205") || msg.includes("Could not find the table")) {
        console.warn("[manifest] table missing (migration 014 not applied) — returning empty manifest");
      } else {
        throw err;
      }
    }

    return NextResponse.json(
      {
        client_id: clientId,
        manifest: items,
        timestamp: new Date().toISOString(),
      },
      { headers: CORS_HEADERS },
    );
  } catch (e: any) {
    console.error("[manifest] Unhandled error:", e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
