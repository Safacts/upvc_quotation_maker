import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  });

const projectQuerySchema = z.object({
  status: z
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

const projectWriteSchema = z.object({
  project_name: text(200).refine((v) => v.length > 0, { message: "Project name is required" }),
  lead_id: optionalUuid,
  order_id: optionalUuid,
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "planning").toString().trim().toLowerCase())
    .pipe(z.enum(PROJECT_STATUSES)),
  start_date: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  end_date: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  budget: numberish(0),
  actual_cost: numberish(0),
  progress: numberish(0).transform((n) => Math.min(100, Math.max(0, Math.floor(n)))),
  notes: text(2000),
});

const PROJECT_SELECT =
  "id,project_name,status,lead_id,order_id,start_date,end_date,budget,actual_cost,progress,notes,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = projectQuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, q, page, page_size } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      filters.status = "eq." + status;
    }
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(project_name.ilike.*${safe}*,notes.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("projects", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGet("projects", {
      client_id: "eq." + clientId,
      ...filters,
      select: PROJECT_SELECT,
      order: "created_at.desc,id.desc",
      limit: page_size,
      offset,
    });

    const projectRows = Array.isArray(rows) ? rows : [];
    const leadIds = [...new Set(projectRows.map((r: any) => r.lead_id).filter(Boolean))];
    const orderIds = [...new Set(projectRows.map((r: any) => r.order_id).filter(Boolean))];

    let leadMap: Record<string, any> = {};
    let orderMap: Record<string, any> = {};

    if (leadIds.length) {
      try {
        const leads = await supaGet("leads", {
          id: "in.(" + leadIds.join(",") + ")",
          client_id: "eq." + clientId,
          select: "id,name,company,phone",
        });
        if (Array.isArray(leads)) {
          leadMap = Object.fromEntries(leads.map((l: any) => [l.id, l]));
        }
      } catch {}
    }

    if (orderIds.length) {
      try {
        const orders = await supaGet("orders", {
          id: "in.(" + orderIds.join(",") + ")",
          client_id: "eq." + clientId,
          select: "id,order_number,status,total_amount",
        });
        if (Array.isArray(orders)) {
          orderMap = Object.fromEntries(orders.map((o: any) => [o.id, o]));
        }
      } catch {}
    }

    const list = projectRows.map((r: any) => ({
      ...r,
      lead: r.lead_id ? leadMap[r.lead_id] || null : null,
      order: r.order_id ? orderMap[r.order_id] || null : null,
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

    const parsed = projectWriteSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return consoleJson({ error: "Validation failed", fields }, 400);
    }
    const data = parsed.data;

    if (data.lead_id) {
      const leadOwner = await supaGet("leads", {
        id: "eq." + data.lead_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(leadOwner) || leadOwner.length === 0) {
        return consoleJson({ error: "Unknown lead" }, 404);
      }
    }

    if (data.order_id) {
      const orderOwner = await supaGet("orders", {
        id: "eq." + data.order_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(orderOwner) || orderOwner.length === 0) {
        return consoleJson({ error: "Unknown order" }, 404);
      }
    }

    const inserted = await supaPost("projects", {
      client_id: gate.clientId,
      project_name: data.project_name,
      lead_id: data.lead_id,
      order_id: data.order_id,
      status: data.status,
      start_date: data.start_date,
      end_date: data.end_date,
      budget: data.budget,
      actual_cost: data.actual_cost,
      progress: data.progress,
      notes: data.notes,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ project: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
