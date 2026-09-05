import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/offcuts — list reusable off-cuts for Builder optimizer
 * POST /api/console/offcuts — save a new off-cut from cutting sheet
 * Table: offcut_inventory (client_id, profile_code, length_mm)
 * Replaces BuilderClient offcuts comma-text with traceable inventory
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const url = new URL(request.url);
    const profile = (url.searchParams.get("profile_code") || "").trim().slice(0, 50);
    const filters: Record<string, string> = { is_reusable: "eq.true" };
    if (profile) filters.profile_code = "eq." + profile;
    const rows = await supaGet("offcut_inventory", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,profile_code,length_mm,stock_mm,created_at",
      order: "created_at.desc",
      limit: 100,
    });
    return consoleJson({ rows: Array.isArray(rows) ? rows : [] });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const code = String(body?.profile_code || "").trim().slice(0, 50);
    const len = Math.floor(Number(body?.length_mm) || 0);
    if (!code || len <= 0 || len > 6000) return consoleJson({ error: "profile_code and 1-6000 length_mm required" }, 400);
    const inserted = await supaPost("offcut_inventory", {
      client_id: gate.clientId,
      profile_code: code,
      length_mm: len,
      stock_mm: 6000,
      is_reusable: true,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ offcut: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
