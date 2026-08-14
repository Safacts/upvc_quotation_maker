import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPatch, supaGetSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = ["cutting", "assembly", "qc", "packing", "ready"] as const;
const STATUSES = ["pending", "in_progress", "completed", "on_hold"] as const;

const querySchema = z.object({
  stage: z.string().optional(),
  status: z.string().optional(),
  order_id: z.string().optional(),
  batch_id: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "stage", "status", "priority"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const updateSchema = z.object({
  stage: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? undefined : s;
  }),
  status: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? undefined : s;
  }),
  assigned_to: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  priority: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }),
  notes: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  batch_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
});

const LIST_SELECT =
  "id,order_id,stage,status,assigned_to,batch_id,priority,started_at,completed_at,notes,created_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      stage: url.searchParams.get("stage") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      order_id: url.searchParams.get("order_id") ?? undefined,
      batch_id: url.searchParams.get("batch_id") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { stage, status, order_id, batch_id, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (stage) {
      const stages = stage.split(",").map(s => s.trim()).filter(Boolean);
      if (stages.length === 1) filters.stage = "eq." + stages[0];
      else if (stages.length > 1) filters.stage = "in.(" + stages.join(",") + ")";
    }
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) filters.status = "eq." + statuses[0];
      else if (statuses.length > 1) filters.status = "in.(" + statuses.join(",") + ")";
    }
    if (order_id) filters.order_id = "eq." + order_id;
    if (batch_id) filters.batch_id = "eq." + batch_id;

    const totalCount = await supaCount("production_orders", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("production_orders", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const orderIds = [...new Set((Array.isArray(rows) ? rows : []).map((r: any) => r.order_id).filter(Boolean))];
    let orderMap: Record<string, any> = {};

    if (orderIds.length) {
      const orders = await supaGet("orders", {
        id: "in.(" + orderIds.join(",") + ")",
        client_id: "eq." + clientId,
        select: "id,order_number,status,customer_id",
      });
      if (Array.isArray(orders)) {
        const custIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
        let custMap: Record<string, any> = {};
        if (custIds.length) {
          const custs = await supaGet("customers", {
            id: "in.(" + custIds.join(",") + ")",
            client_id: "eq." + clientId,
            select: "id,name",
          });
          if (Array.isArray(custs)) {
            custMap = Object.fromEntries(custs.map((c: any) => [c.id, c]));
          }
        }
        for (const o of orders) {
          orderMap[o.id] = {
            order_number: o.order_number,
            status: o.status,
            customer_name: custMap[o.customer_id]?.name || "",
          };
        }
      }
    }

    const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      ...r,
      order: orderMap[r.order_id] || null,
    }));

    return consoleJson({
      rows: list,
      page,
      page_size,
      total_count: totalCount >= 0 ? totalCount : list.length,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / page_size) : 1,
      sort,
      dir,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const id = body?.id;
    if (!id) return consoleJson({ error: "id is required" }, 400);

    const rows = await supaGet("production_orders", {
      id: "eq." + id,
      client_id: "eq." + clientId,
      select: "id,client_id",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    const patchData: Record<string, any> = {};
    if (data.stage !== undefined) {
      if (!STAGES.includes(data.stage as any)) {
        return consoleJson({ error: `Invalid stage. Must be one of: ${STAGES.join(", ")}` }, 400);
      }
      patchData.stage = data.stage;
    }
    if (data.status !== undefined) {
      if (!STATUSES.includes(data.status as any)) {
        return consoleJson({ error: `Invalid status. Must be one of: ${STATUSES.join(", ")}` }, 400);
      }
      patchData.status = data.status;
      if (data.status === "in_progress" || data.status === "completed") {
        patchData.started_at = new Date().toISOString();
      }
      if (data.status === "completed") {
        patchData.completed_at = new Date().toISOString();
      }
    }
    if (data.assigned_to !== undefined) patchData.assigned_to = data.assigned_to;
    if (data.priority !== undefined) patchData.priority = data.priority;
    if (data.notes !== undefined) patchData.notes = data.notes;
    if (data.batch_id !== undefined) patchData.batch_id = data.batch_id;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatch(
      "production_orders",
      { id: "eq." + id, client_id: "eq." + clientId },
      patchData,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
