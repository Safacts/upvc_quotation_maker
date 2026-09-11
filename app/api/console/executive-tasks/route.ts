import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost, supaCount } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const writeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(""),
  lead_id: z.string().uuid().optional().nullable(),
  quotation_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().trim().max(200).optional().default(""),
  status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional().default("pending"),
  priority: z.number().int().min(1).max(5).optional().default(1),
  due_at: z.string().trim().optional().nullable(),
});

const SELECT =
  "id,client_id,title,description,lead_id,quotation_id,assigned_to,assigned_by,status,priority,due_at,done_at,location_lat,location_lng,location_address,created_at,updated_at";

export async function GET(request: NextRequest) {
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return gate.error;
  const url = new URL(request.url);
  const assignedTo = (url.searchParams.get("assigned_to") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") ?? 50) || 50));
  try {
    const filters: Record<string, string> = { client_id: "eq." + gate.clientId };
    if (assignedTo) filters.assigned_to = "eq." + assignedTo;
    if (status) filters.status = "eq." + status;
    const total = await supaCount("executive_tasks", filters);
    const rows = await supaGet("executive_tasks", {
      ...filters,
      select: SELECT,
      order: "created_at.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return consoleJson({ rows, total_count: total, page, page_size: pageSize });
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return consoleJson({ error: "Invalid JSON" }, 400);
  }
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return gate.error;
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) return consoleJson({ error: "Validation failed" }, 400);
  const d = parsed.data;
  try {
    const inserted = await supaPost("executive_tasks", {
      client_id: gate.clientId,
      title: d.title,
      description: d.description ?? "",
      lead_id: d.lead_id ?? null,
      quotation_id: d.quotation_id ?? null,
      assigned_to: d.assigned_to ?? "",
      assigned_by: gate.session?.email ?? "",
      status: d.status ?? "pending",
      priority: d.priority ?? 1,
      due_at: d.due_at || null,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ task: row }, 201);
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}
