import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal_build_status
 * Lightweight poll endpoint for the portal's "Building..." auto-refresh.
 * Returns the build-related strings from the caller's own client config row —
 * same-origin portal, so no CORS headers are needed. Tenant scope comes
 * exclusively from the HttpOnly session cookie (session.client_id), never from
 * the query string.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    // Fail closed: only a real customer session holds a tenant identity. The
    // `signup` pre-account role must NOT be able to read any config row.
    if (!session || session.role !== "customer" || !session.client_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await supaGet("clients", {
      id: "eq." + session.client_id,
      select: "config",
    });
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row || !row.config) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const cfg = row.config;
    const result: Record<string, string> = {};
    if (cfg.appDownloadUrl) result.appDownloadUrl = String(cfg.appDownloadUrl);
    if (cfg.lastBuildTriggeredAt) result.lastBuildTriggeredAt = String(cfg.lastBuildTriggeredAt);
    if (cfg.lastBuildCompletedAt) result.lastBuildCompletedAt = String(cfg.lastBuildCompletedAt);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
