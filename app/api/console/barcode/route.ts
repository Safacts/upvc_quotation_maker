import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPost, supaCount } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/barcode -- list barcodes with order context
 * POST /api/console/barcode -- generate barcode for a production order
 *
 * Barcode value format: VTH-YYYYMMDD-NNNN (NNNN = daily sequence, zero-padded)
 */

const barcodeCreateSchema = z.object({
  order_id: z.string().uuid({ message: "Valid order_id required" }),
  production_order_id: z.string().uuid({ message: "Valid production_order_id required" }).optional(),
  stage: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "cutting").toString().trim().toLowerCase()),
});

async function generateBarcodeValue(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `VTH-${dateStr}-`;

  // Find the highest sequence number used today
  const existing = await supaGet("barcodes", {
    barcode_value: `like.${prefix}%`,
    select: "barcode_value",
    order: "barcode_value.desc",
    limit: 1,
  });

  let seq = 1;
  if (Array.isArray(existing) && existing.length > 0) {
    const last = existing[0].barcode_value;
    const parts = last.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const stage = (url.searchParams.get("stage") || "").trim().slice(0, 50);
    const orderId = (url.searchParams.get("order_id") || "").trim();
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string | number | boolean> = {};
    if (stage) filters.stage = "eq." + stage;
    if (orderId) filters.order_id = "eq." + orderId;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(barcode_value.ilike.*${safe}*,scanned_by.ilike.*${safe}*,location.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("barcodes", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });

    const rows = await supaGet("barcodes", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select:
        "id,order_id,production_order_id,barcode_value,stage,scanned_at,scanned_by,location,created_at," +
        "production_orders(id,status,assigned_to,notes,orders(order_number,customer_id,customers(name,phone)))",
      order: "created_at.desc,id.desc",
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

    const parsed = barcodeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // Verify the production order belongs to this client
    const prodOrders = await supaGet("production_orders", {
      id: "eq." + data.production_order_id,
      client_id: "eq." + gate.clientId,
      select: "id,order_id,stage",
      limit: 1,
    });
    if (!Array.isArray(prodOrders) || prodOrders.length === 0) {
      return consoleJson({ error: "Production order not found" }, 404);
    }

    // Verify order belongs to this client
    const order = await supaGet("orders", {
      id: "eq." + data.order_id,
      client_id: "eq." + gate.clientId,
      select: "id",
      limit: 1,
    });
    if (!Array.isArray(order) || order.length === 0) {
      return consoleJson({ error: "Order not found" }, 404);
    }

    const barcodeValue = await generateBarcodeValue();

    const inserted = await supaPost("barcodes", {
      client_id: gate.clientId,
      order_id: data.order_id,
      production_order_id: data.production_order_id,
      barcode_value: barcodeValue,
      stage: data.stage || prodOrders[0].stage || "cutting",
    });

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ barcode: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
