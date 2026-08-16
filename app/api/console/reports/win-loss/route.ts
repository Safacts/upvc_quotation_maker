import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supabaseRpc } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || null;
    const to = url.searchParams.get("to") || null;
    const data = await supabaseRpc("get_win_loss_pipeline", {
      p_client_id: gate.clientId,
      p_from: from,
      p_to: to,
    });
    return consoleJson(data);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
