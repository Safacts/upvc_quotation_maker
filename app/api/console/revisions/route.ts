import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/console/revisions — snapshot a quotation revision (Eva revisionNumber)
// GET  /api/console/revisions?quotation_id= — list revisions

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const qid = new URL(request.url).searchParams.get("quotation_id")?.trim();
    if (!qid) return consoleJson({ error: "quotation_id required" }, 400);
    const rows = await supaGet("quotation_revisions", {
      quotation_id: "eq." + qid,
      select: "id,revision_number,created_at",
      order: "revision_number.desc",
    });
    return consoleJson({ rows: Array.isArray(rows) ? rows : [] });
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { return consoleJson({ error: "Invalid JSON" }, 400); }
    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const qid = String(body?.quotation_id || "").trim();
    const snapshot = body?.snapshot;
    if (!qid || !snapshot) return consoleJson({ error: "quotation_id and snapshot required" }, 400);
    const existing = await supaGet("quotation_revisions", { quotation_id: "eq." + qid, select: "revision_number", order: "revision_number.desc", limit: 1 });
    const nextNum = Array.isArray(existing) && existing[0]?.revision_number ? Number(existing[0].revision_number) + 1 : 1;
    const inserted = await supaPost("quotation_revisions", {
      quotation_id: qid,
      revision_number: nextNum,
      snapshot,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ revision: row }, 201);
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}
