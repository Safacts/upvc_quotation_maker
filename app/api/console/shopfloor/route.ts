import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost, supaCount, supaPatch } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/shopfloor -- list shop floor updates (real-time feed)
 * POST /api/console/shopfloor -- record a shop floor update
 *
 * The GET endpoint returns recent updates with production order context,
 * suitable for a live feed or dashboard widget.
 */

const STAGE_ORDER = ["cutting", "assembly", "qc", "packing", "ready"];

const shopfloorWriteSchema = z.object({
  production_order_id: z.string().uuid({ message: "Valid production_order_id required" }),
  stage: z
    .string()
    .min(1, { message: "Stage is required" })
    .max(50),
  status: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "in_progress").toString().trim().toLowerCase()),
  worker_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  notes: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const stage = (url.searchParams.get("stage") || "").trim().slice(0, 50);
    const status = (url.searchParams.get("status") || "").trim().slice(0, 50);
    const prodOrderId = (url.searchParams.get("production_order_id") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string | number | boolean> = {};
    if (stage) filters.stage = "eq." + stage;
    if (status) filters.status = "eq." + status;
    if (prodOrderId) filters.production_order_id = "eq." + prodOrderId;
    if (since) filters.timestamp = "gte." + since;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(worker_id.ilike.*${safe}*,notes.ilike.*${safe}*,stage.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("shopfloor_updates", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });

    const rows = await supaGet("shopfloor_updates", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select:
        "id,production_order_id,stage,status,worker_id,notes,timestamp," +
        "production_orders(id,status,assigned_to,batch_id,notes,order_id," +
        "orders(order_number,customer_id,customers(name,phone)))",
      order: "timestamp.desc,id.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : (rows?.length ?? 0),
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
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

    const parsed = shopfloorWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // Verify production order belongs to this client
    const prodOrders = await supaGet("production_orders", {
      id: "eq." + data.production_order_id,
      client_id: "eq." + gate.clientId,
      select: "id,stage,status",
      limit: 1,
    });
    if (!Array.isArray(prodOrders) || prodOrders.length === 0) {
      return consoleJson({ error: "Production order not found" }, 404);
    }

    const now = new Date().toISOString();

    // Advance production order stage if going forward in pipeline
    const prodOrder = prodOrders[0];
    const currentIdx = STAGE_ORDER.indexOf((prodOrder.stage || "cutting").toLowerCase());
    const newIdx = STAGE_ORDER.indexOf(data.stage.toLowerCase());

    if (newIdx > currentIdx && newIdx >= 0) {
      const updatePayload: Record<string, any> = { stage: data.stage };
      // Mark started_at when entering first stage
      if (currentIdx === 0 && !prodOrder.status) {
        updatePayload.started_at = now;
      }
      await supaPatch(
        "production_orders",
        { id: "eq." + data.production_order_id },
        updatePayload,
      );
    }

    const inserted = await supaPost("shopfloor_updates", {
      client_id: gate.clientId,
      production_order_id: data.production_order_id,
      stage: data.stage,
      status: data.status,
      worker_id: data.worker_id,
      notes: data.notes,
      timestamp: now,
    });

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ update: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
