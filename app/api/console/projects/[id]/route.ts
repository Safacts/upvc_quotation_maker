import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaDelete } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_STATUSES = ["planning", "in_progress", "on_hold", "completed", "cancelled"] as const;

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= max, { message: `Must be ${max} characters or fewer` });

const numberish = (fallback: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return fallback;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  });

const DETAIL_SELECT =
  "id,project_name,status,lead_id,order_id,start_date,end_date,budget,actual_cost,progress,notes,created_at,updated_at";

const projectUpdateSchema = z.object({
  project_name: text(200).optional(),
  lead_id: optionalUuid.optional(),
  order_id: optionalUuid.optional(),
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return undefined;
      return v.toString().trim().toLowerCase();
    })
    .pipe(z.enum(PROJECT_STATUSES).optional()),
  start_date: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : v;
    })
    .optional(),
  end_date: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : v;
    })
    .optional(),
  budget: numberish(0).optional(),
  actual_cost: numberish(0).optional(),
  progress: numberish(0).transform((n) => Math.min(100, Math.max(0, Math.floor(n)))).optional(),
  notes: text(2000).optional(),
});

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("projects", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("projects", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const project = rows[0];

    let lead: any = null;
    let order: any = null;

    if (project.lead_id) {
      try {
        const leadRows = await supaGet("leads", {
          id: "eq." + project.lead_id,
          client_id: "eq." + gate.clientId,
          select: "id,name,company,phone,email",
          limit: 1,
        });
        if (Array.isArray(leadRows) && leadRows.length > 0) {
          lead = leadRows[0];
        }
      } catch {}
    }

    if (project.order_id) {
      try {
        const orderRows = await supaGet("orders", {
          id: "eq." + project.order_id,
          client_id: "eq." + gate.clientId,
          select: "id,order_number,status,total_amount,customer_id",
          limit: 1,
        });
        if (Array.isArray(orderRows) && orderRows.length > 0) {
          order = orderRows[0];
        }
      } catch {}
    }

    return consoleJson({ project, lead, order });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }

    const parsed = projectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return consoleJson({ error: "Validation failed", fields }, 400);
    }

    const patchData: Record<string, any> = {};
    if (parsed.data.project_name !== undefined) patchData.project_name = parsed.data.project_name;
    if (parsed.data.lead_id !== undefined) patchData.lead_id = parsed.data.lead_id;
    if (parsed.data.order_id !== undefined) patchData.order_id = parsed.data.order_id;
    if (parsed.data.status !== undefined) patchData.status = parsed.data.status;
    if (parsed.data.start_date !== undefined) patchData.start_date = parsed.data.start_date;
    if (parsed.data.end_date !== undefined) patchData.end_date = parsed.data.end_date;
    if (parsed.data.budget !== undefined) patchData.budget = parsed.data.budget;
    if (parsed.data.actual_cost !== undefined) patchData.actual_cost = parsed.data.actual_cost;
    if (parsed.data.progress !== undefined) patchData.progress = parsed.data.progress;
    if (parsed.data.notes !== undefined) patchData.notes = parsed.data.notes;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    if (patchData.lead_id) {
      const leadOwner = await supaGet("leads", {
        id: "eq." + patchData.lead_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(leadOwner) || leadOwner.length === 0) {
        return consoleJson({ error: "Unknown lead" }, 404);
      }
    }

    if (patchData.order_id) {
      const orderOwner = await supaGet("orders", {
        id: "eq." + patchData.order_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(orderOwner) || orderOwner.length === 0) {
        return consoleJson({ error: "Unknown order" }, 404);
      }
    }

    await supaPatch(
      "projects",
      { id: "eq." + id, client_id: "eq." + owner.client_id },
      patchData,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }

    await supaDelete("projects", {
      id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
