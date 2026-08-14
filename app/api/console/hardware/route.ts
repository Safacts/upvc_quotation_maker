import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HARDWARE_TYPES = ["handle", "lock", "hinge", "roller", "bracket", "seal"] as const;

const querySchema = z.object({
  type: z.string().optional(),
  low_stock: z.coerce.boolean().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "name", "type", "quantity", "cost_per_unit"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const writeSchema = z.object({
  name: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Name is required" })
    .refine(v => v.length <= 200, { message: "Name must be 200 characters or fewer" }),
  type: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Type is required" }),
  brand: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 200, { message: "Brand must be 200 characters or fewer" }),
  model: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 200, { message: "Model must be 200 characters or fewer" }),
  quantity: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    }),
  unit: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim() || "nos"),
  reorder_level: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    }),
  cost_per_unit: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }),
  supplier: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 200, { message: "Supplier must be 200 characters or fewer" }),
});

const LIST_SELECT =
  "id,name,type,brand,model,quantity,unit,reorder_level,cost_per_unit,supplier,created_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      type: url.searchParams.get("type") ?? undefined,
      low_stock: url.searchParams.get("low_stock") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { type, low_stock, q, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (type) {
      const types = type.split(",").map(s => s.trim()).filter(Boolean);
      if (types.length === 1) {
        filters.type = "eq." + types[0];
      } else if (types.length > 1) {
        filters.type = "in.(" + types.join(",") + ")";
      }
    }
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,brand.ilike.*${safe}*,model.ilike.*${safe}*,supplier.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("hardware", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("hardware", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const list = Array.isArray(rows) ? rows : [];
    const lowStockList = low_stock === true
      ? list.filter((r: any) => Number(r.reorder_level) > 0 && Number(r.quantity) <= Number(r.reorder_level))
      : list;

    return consoleJson({
      rows: low_stock === true ? lowStockList : list,
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

    const parsed = writeSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    if (!HARDWARE_TYPES.includes(data.type as any)) {
      return consoleJson({ error: `Invalid type. Must be one of: ${HARDWARE_TYPES.join(", ")}` }, 400);
    }

    const inserted = await supaPost("hardware", {
      client_id: gate.clientId,
      name: data.name,
      type: data.type,
      brand: data.brand,
      model: data.model,
      quantity: data.quantity,
      unit: data.unit,
      reorder_level: data.reorder_level,
      cost_per_unit: data.cost_per_unit,
      supplier: data.supplier,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ hardware: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
