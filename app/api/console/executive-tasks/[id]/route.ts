import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  assigned_to: z.string().trim().max(200).optional(),
  due_at: z.string().trim().nullable().optional(),
  location_lat: z.number().nullable().optional(),
  location_lng: z.number().nullable().optional(),
  location_address: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return consoleJson({ error: "Invalid JSON" }, 400);
  }
  const gate = await requireConsoleSession(request);
  if (!gate.ok) return gate.error;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return consoleJson({ error: "Validation failed" }, 400);
  try {
    const existing = await supaGet("executive_tasks", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id",
      limit: 1,
    });
    if (!Array.isArray(existing) || existing.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "done") patch.done_at = new Date().toISOString();
    const updated = await supaPatch(
      "executive_tasks",
      { id: "eq." + id, client_id: "eq." + gate.clientId },
      patch
    );
    const row = Array.isArray(updated) ? updated[0] : updated;
    return consoleJson({ task: row });
  } catch (e: unknown) {
    return consoleJson({ error: String((e as Error)?.message ?? e) }, 500);
  }
}
