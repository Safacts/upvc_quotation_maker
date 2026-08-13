import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATERIAL_TYPES = ["profile", "glass", "hardware", "sealant"] as const;
const STATUSES = ["pending", "ordered", "received", "used"] as const;

const querySchema = z.object({
  material_type: z.string().optional(),
  status: z.string().optional(),
  order_id: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "product_name", "material_type", "quantity", "total_cost", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const writeSchema = z.object({
  order_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  product_name: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Product name is required" })
    .refine(v => v.length <= 200, { message: "Product name must be 200 characters or fewer" }),
  material_type: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Material type is required" }),
  specification: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 500, { message: "Specification must be 500 characters or fewer" }),
  quantity: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    })
    .refine(n => n > 0, { message: "Quantity must be positive" }),
  unit: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Unit is required" }),
  unit_cost: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }),
});

const LIST_SELECT =
  "id,order_id,product_name,material_type,specification,quantity,unit,unit_cost,total_cost,status,created_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      material_type: url.searchParams.get("material_type"),
      status: url.searchParams.get("status"),
      order_id: url.searchParams.get("order_id"),
      q: url.searchParams.get("q"),
      page: url.searchParams.get("page"),
      page_size: url.searchParams.get("page_size"),
      sort: url.searchParams.get("sort"),
      dir: url.searchParams.get("dir"),
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { material_type, status, order_id, q, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (material_type) {
      const types = material_type.split(",").map(s => s.trim()).filter(Boolean);
      if (types.length === 1) {
        filters.material_type = "eq." + types[0];
      } else if (types.length > 1) {
        filters.material_type = "in.(" + types.join(",") + ")";
      }
    }
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filters.status = "eq." + statuses[0];
      } else if (statuses.length > 1) {
        filters.status = "in.(" + statuses.join(",") + ")";
      }
    }
    if (order_id) filters.order_id = "eq." + order_id;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(product_name.ilike.*${safe}*,specification.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("materials", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("materials", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const list = Array.isArray(rows) ? rows : [];

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

    if (!MATERIAL_TYPES.includes(data.material_type as any)) {
      return consoleJson({ error: `Invalid material_type. Must be one of: ${MATERIAL_TYPES.join(", ")}` }, 400);
    }

    if (data.order_id) {
      const owner = await supaGet("orders", {
        id: "eq." + data.order_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleJson({ error: "Unknown order" }, 404);
      }
    }

    const inserted = await supaPost("materials", {
      client_id: gate.clientId,
      order_id: data.order_id,
      product_name: data.product_name,
      material_type: data.material_type,
      specification: data.specification,
      quantity: data.quantity,
      unit: data.unit,
      unit_cost: data.unit_cost,
      status: "pending",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ material: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
