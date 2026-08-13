import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
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

const leadQuerySchema = z.object({
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .optional(),
  source: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .optional(),
  q: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .optional(),
  page: numberish(1).transform((n) => Math.max(1, Math.floor(n))),
  page_size: numberish(50).transform((n) => Math.min(200, Math.max(1, Math.floor(n)))),
});

const leadWriteSchema = z.object({
  name: text(200).refine((v) => v.length > 0, { message: "Name is required" }),
  company: text(200),
  phone: text(40),
  email: text(200),
  source: text(40),
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "new").toString().trim().toLowerCase())
    .pipe(z.enum(LEAD_STATUSES)),
  value: numberish(0),
  notes: text(2000),
  assigned_to: text(200),
  next_followup: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
});

const LEAD_SELECT =
  "id,name,company,phone,email,source,status,value,notes,assigned_to,next_followup,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = leadQuerySchema.safeParse({
      status: url.searchParams.get("status"),
      source: url.searchParams.get("source"),
      q: url.searchParams.get("q"),
      page: url.searchParams.get("page"),
      page_size: url.searchParams.get("page_size"),
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, source, q, page, page_size } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      filters.status = "eq." + status;
    }
    if (source) {
      filters.source = "eq." + source;
    }
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,company.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("leads", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGet("leads", {
      client_id: "eq." + clientId,
      ...filters,
      select: LEAD_SELECT,
      order: "created_at.desc,id.desc",
      limit: page_size,
      offset,
    });

    const leadIds = (Array.isArray(rows) ? rows : []).map((r: any) => r.id);
    let activityCounts: Record<string, number> = {};

    if (leadIds.length) {
      try {
        const activities = await supaGet("lead_activities", {
          lead_id: "in.(" + leadIds.join(",") + ")",
          client_id: "eq." + clientId,
          select: "lead_id",
        });
        if (Array.isArray(activities)) {
          for (const a of activities) {
            activityCounts[a.lead_id] = (activityCounts[a.lead_id] || 0) + 1;
          }
        }
      } catch {}
    }

    const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      ...r,
      activity_count: activityCounts[r.id] || 0,
    }));

    return consoleJson({
      rows: list,
      page,
      page_size,
      total_count: totalCount >= 0 ? totalCount : list.length,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / page_size) : 1,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;

    const parsed = leadWriteSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return consoleJson({ error: "Validation failed", fields }, 400);
    }
    const data = parsed.data;

    const inserted = await supaPost("leads", {
      client_id: gate.clientId,
      name: data.name,
      company: data.company,
      phone: data.phone,
      email: data.email,
      source: data.source,
      status: data.status,
      value: data.value,
      notes: data.notes,
      assigned_to: data.assigned_to,
      next_followup: data.next_followup,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ lead: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
