import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/inventory — product list with stock levels.
 * POST /api/console/inventory — create product with initial stock.
 */

const inventoryWriteSchema = z.object({
  name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length > 0, { message: "Name is required" })
    .refine((v) => v.length <= 200, { message: "Name must be 200 characters or fewer" }),
  category: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= 100, { message: "Category must be 100 characters or fewer" }),
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length <= 1000, { message: "Description must be 1000 characters or fewer" }),
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
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.floor(n) : 0;
    })
    .refine((n) => n >= 0, { message: "Stock quantity cannot be negative" }),
  low_stock_threshold: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 10;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.floor(n) : 10;
    })
    .refine((n) => n >= 0, { message: "Low stock threshold cannot be negative" }),
  hsn_code: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const category = (url.searchParams.get("category") || "").trim().slice(0, 100);
    const lowStock = url.searchParams.get("low_stock") === "true";
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string | number | boolean> = {
      soft_deleted: "eq.false",
    };
    if (category) filters.category = "eq." + category;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,description.ilike.*${safe}*,category.ilike.*${safe}*,hsn_code.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("products", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });
    const rows = await supaGet("products", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,name,category,description,price,unit,stock_quantity,low_stock_threshold,hsn_code,created_at,updated_at",
      order: "name.asc,id.asc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    let list = Array.isArray(rows) ? rows : [];

    if (lowStock) {
      list = list.filter(
        (r: any) => (r.stock_quantity ?? 0) <= (r.low_stock_threshold ?? 10),
      );
    }

    return consoleJson({
      rows: list,
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

    const parsed = inventoryWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const inserted = await supaPost("products", {
      client_id: gate.clientId,
      name: data.name,
      category: data.category,
      description: data.description,
      price: data.price,
      unit: data.unit || "SFT",
      stock_quantity: data.stock_quantity,
      low_stock_threshold: data.low_stock_threshold,
      hsn_code: data.hsn_code || "3925",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ product: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
