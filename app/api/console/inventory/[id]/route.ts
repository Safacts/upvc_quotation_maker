import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET   /api/console/inventory/[id] — get product with stock info.
 * PATCH /api/console/inventory/[id] — update product.
 */

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("products", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const inventoryUpdateSchema = z.object({
  name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length > 0, { message: "Name is required" })
    .refine((v) => v.length <= 200, { message: "Name must be 200 characters or fewer" }),
  category: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  price: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    })
    .refine((n) => n >= 0, { message: "Price cannot be negative" }),
  unit: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  stock_quantity: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.floor(n) : undefined;
    })
    .refine((n) => n === undefined || n >= 0, { message: "Stock quantity cannot be negative" }),
  low_stock_threshold: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.floor(n) : undefined;
    })
    .refine((n) => n === undefined || n >= 0, { message: "Low stock threshold cannot be negative" }),
  hsn_code: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("products", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,name,category,description,price,unit,stock_quantity,low_stock_threshold,hsn_code,created_at,updated_at",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }

    return consoleJson({ product: rows[0] });
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
    const clientId = owner.client_id;

    const parsed = inventoryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const update: Record<string, any> = {
      name: data.name,
      category: data.category,
      description: data.description,
      price: data.price,
      unit: data.unit || "SFT",
      hsn_code: data.hsn_code || "3925",
    };
    if (data.stock_quantity !== undefined) update.stock_quantity = data.stock_quantity;
    if (data.low_stock_threshold !== undefined) update.low_stock_threshold = data.low_stock_threshold;

    await supaPatch(
      "products",
      { id: "eq." + id, client_id: "eq." + clientId },
      update,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
