import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaDelete } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DETAIL_SELECT =
  "id,name,company,phone,email,source,status,value,notes,assigned_to,next_followup,created_at,updated_at";

const leadUpdateSchema = z.object({
  name: text(200).optional(),
  company: text(200).optional(),
  phone: text(40).optional(),
  email: text(200).optional(),
  source: text(40).optional(),
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return undefined;
      return v.toString().trim().toLowerCase();
    })
    .pipe(z.enum(LEAD_STATUSES).optional()),
  value: numberish(0).optional(),
  notes: text(2000).optional(),
  assigned_to: text(200).optional(),
  next_followup: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : v;
    })
    .optional(),
});

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("leads", {
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

    const rows = await supaGet("leads", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const lead = rows[0];

    let activities: any[] = [];
    try {
      const actRows = await supaGet("lead_activities", {
        lead_id: "eq." + id,
        client_id: "eq." + gate.clientId,
        select: "id,type,description,outcome,next_followup,created_at",
        order: "created_at.desc",
      });
      activities = Array.isArray(actRows) ? actRows : [];
    } catch {}

    return consoleJson({ lead, activities });
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

    const parsed = leadUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return consoleJson({ error: "Validation failed", fields }, 400);
    }

    const patchData: Record<string, any> = {};
    if (parsed.data.name !== undefined) patchData.name = parsed.data.name;
    if (parsed.data.company !== undefined) patchData.company = parsed.data.company;
    if (parsed.data.phone !== undefined) patchData.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) patchData.email = parsed.data.email;
    if (parsed.data.source !== undefined) patchData.source = parsed.data.source;
    if (parsed.data.status !== undefined) patchData.status = parsed.data.status;
    if (parsed.data.value !== undefined) patchData.value = parsed.data.value;
    if (parsed.data.notes !== undefined) patchData.notes = parsed.data.notes;
    if (parsed.data.assigned_to !== undefined) patchData.assigned_to = parsed.data.assigned_to;
    if (parsed.data.next_followup !== undefined) patchData.next_followup = parsed.data.next_followup;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatch(
      "leads",
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

    await supaDelete("leads", {
      id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
