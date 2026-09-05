import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/console/project-openings?project_name= — list openings for project merge (Eva Total Area)
// POST — save opening with window_json/bom_json

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const project = new URL(request.url).searchParams.get("project_name")?.trim().slice(0, 100);
    const filters: Record<string, string> = {};
    if (project) filters.project_name = "eq." + project;
    const rows = await supaGet("project_openings", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,project_name,opening_code,window_json,bom_json,created_at",
      order: "created_at.desc",
      limit: 50,
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
    const project = String(body?.project_name || "").trim().slice(0, 100);
    const code = String(body?.opening_code || "01").trim().slice(0, 20);
    const window_json = body?.window_json;
    const bom_json = body?.bom_json || null;
    if (!project || !window_json) return consoleJson({ error: "project_name and window_json required" }, 400);
    const inserted = await supaPost("project_openings", {
      client_id: gate.clientId,
      project_name: project,
      opening_code: code,
      quotation_id: body?.quotation_id || null,
      window_json,
      bom_json,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ opening: row }, 201);
  } catch (e: any) { return consoleJson({ error: String(e?.message ?? e) }, 500); }
}
