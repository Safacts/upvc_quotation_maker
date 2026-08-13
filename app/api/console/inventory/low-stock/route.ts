import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supabaseRpc } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/inventory/low-stock — products below low_stock_threshold.
 *
 * Calls the get_stock_alerts RPC from migration 021.
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 50)));

    const rows = await supabaseRpc("get_stock_alerts", {
      p_client_id: gate.clientId,
      p_limit: limit,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      count: Array.isArray(rows) ? rows.length : 0,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
