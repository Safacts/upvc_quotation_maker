import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supabaseRpc } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/inventory/stock — list stock movements.
 * POST /api/console/inventory/stock — record stock movement via adjust_stock RPC.
 */

const MOVEMENT_TYPES = ["in", "out", "adjustment"] as const;

const stockMovementSchema = z.object({
  product_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine(
      (v) => v.length > 0 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      { message: "product_id is required and must be a valid uuid" },
    ),
  movement_type: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .refine((v) => (MOVEMENT_TYPES as readonly string[]).includes(v), {
      message: "movement_type must be in, out, or adjustment",
    }),
  quantity: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.floor(n) : 0;
    })
    .refine((n) => n > 0, { message: "Quantity must be greater than 0" }),
  reference: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  note: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const productId = (url.searchParams.get("product_id") || "").trim();
    const movementType = (url.searchParams.get("movement_type") || "").trim().toLowerCase();
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string | number | boolean> = {};
    if (productId) {
      const safe = productId.replace(/[(),*]/g, " ").trim();
      if (safe) filters.product_id = "eq." + safe;
    }
    if (movementType && (MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
      filters.movement_type = "eq." + movementType;
    }

    const totalCount = await supaCount("stock_movements", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });
    const rows = await supaGet("stock_movements", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,product_id,product_name,quantity,movement_type,reference_id,reference_type,note,actor,created_at",
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

    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // Map user-facing movement_type to signed quantity for the RPC
    let signedQuantity: number;
    if (data.movement_type === "in") {
      signedQuantity = data.quantity;
    } else if (data.movement_type === "out") {
      signedQuantity = -data.quantity;
    } else {
      // adjustment: user sends the absolute adjustment; we need direction context.
      // For now treat as a positive adjustment (stock in). The caller should
      // send movement_type "in" or "out" for directional changes.
      signedQuantity = data.quantity;
    }

    const result = await supabaseRpc("adjust_stock", {
      p_client_id: gate.clientId,
      p_product_id: data.product_id,
      p_quantity: signedQuantity,
      p_movement_type: data.movement_type === "out" ? "sale" : data.movement_type === "in" ? "purchase" : "adjustment",
      p_reference_id: data.reference || null,
      p_reference_type: data.reference ? "quotation" : "manual",
      p_note: data.note,
      p_actor: "",
    });

    if (result && result.success === false) {
      return consoleJson({ error: result.error || "Stock adjustment failed" }, 400);
    }

    return consoleJson({ result }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
