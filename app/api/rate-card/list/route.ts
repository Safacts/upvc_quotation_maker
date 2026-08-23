import { NextRequest, NextResponse } from "next/server";
import { supaGet, isServiceKeyConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://app.vitharn.com",
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "customer" && session.role !== "admin")) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!session.client_id) {
      return json({ error: "Session has no tenant" }, 403);
    }
    if (!isServiceKeyConfigured()) {
      return json({ error: "Database not configured" }, 500);
    }

    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";

    const qs: Record<string, string> = {
      client_id: `eq.${session.client_id}`,
      order: "item_type.asc,validity_start.desc.nullslast,updated_at.desc",
      limit: "500",
    };
    if (!includeInactive) {
      qs.is_active = "eq.true";
    }

    const rows = await supaGet("rate_card_items", qs);

    return json({ items: Array.isArray(rows) ? rows : [] });
  } catch (e: unknown) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
