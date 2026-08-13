import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVITY_TYPES = ["call", "email", "whatsapp", "meeting", "note"] as const;

const text = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= max, { message: `Must be ${max} characters or fewer` });

const activityWriteSchema = z.object({
  type: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "note").toString().trim().toLowerCase())
    .pipe(z.enum(ACTIVITY_TYPES)),
  description: text(2000),
  outcome: text(500),
  next_followup: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
});

async function loadOwner(leadId: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("leads", {
    id: "eq." + leadId,
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

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Lead not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Lead not found" }, 404);
    }

    const rows = await supaGet("lead_activities", {
      lead_id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,type,description,outcome,next_followup,created_at",
      order: "created_at.desc",
    });

    return consoleJson({ activities: Array.isArray(rows) ? rows : [] });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(
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
    if (!owner) return consoleJson({ error: "Lead not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Lead not found" }, 404);
    }

    const parsed = activityWriteSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return consoleJson({ error: "Validation failed", fields }, 400);
    }
    const data = parsed.data;

    const inserted = await supaPost("lead_activities", {
      client_id: gate.clientId,
      lead_id: id,
      type: data.type,
      description: data.description,
      outcome: data.outcome,
      next_followup: data.next_followup,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ activity: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
