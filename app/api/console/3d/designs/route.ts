import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaPostSafe } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_TYPES = ["uPVC", "aluminum"] as const;
const CONFIGURATIONS = ["sliding", "casement", "tilt_turn", "fixed"] as const;

const dimensionsSchema = z.object({
  width_mm: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v): number | null => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((n): n is number => n !== null && n > 0, {
      message: "width_mm must be a positive number",
    }),
  height_mm: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v): number | null => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((n): n is number => n !== null && n > 0, {
      message: "height_mm must be a positive number",
    }),
  configuration: z
    .enum(CONFIGURATIONS)
    .catch(() => "fixed" as const),
});

const designSchema = z.object({
  frames: z.array(z.any()).default([]),
  panels: z.array(z.any()).default([]),
});

const designWriteSchema = z.object({
  order_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .refine((v) => v.length > 0, { message: "Name is required" })
    .refine((v) => v.length <= 200, {
      message: "Name must be 200 characters or fewer",
    }),
  profile_type: z.enum(PROFILE_TYPES).default("uPVC"),
  dimensions: dimensionsSchema,
  design: designSchema,
  thumbnail_url: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  model_url: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
});

const DESIGN_SELECT =
  "id,order_id,name,profile_type,dimensions,design,thumbnail_url,model_url,created_at,updated_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const profileType = (url.searchParams.get("profile_type") || "").trim();
    const page = Math.max(
      1,
      Math.floor(Number(url.searchParams.get("page")) || 1),
    );
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string> = {
      client_id: "eq." + clientId,
    };
    if (profileType) filters.profile_type = "eq." + profileType;
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(name.ilike.*${safe}*,profile_type.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("window_designs", { ...filters });
    const rows = await supaGet("window_designs", {
      ...filters,
      select: DESIGN_SELECT,
      order: "created_at.desc,id.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const designs = Array.isArray(rows) ? rows : [];

    const orderIds = [
      ...new Set(designs.map((d: any) => d.order_id).filter(Boolean)),
    ];
    let orderMap: Record<string, any> = {};
    if (orderIds.length) {
      const orders = await supaGet("orders", {
        id: "in.(" + orderIds.join(",") + ")",
        client_id: "eq." + clientId,
        select: "id,order_number,status,total_amount",
      });
      if (Array.isArray(orders)) {
        orderMap = Object.fromEntries(orders.map((o: any) => [o.id, o]));
      }
    }

    const list = designs.map((d: any) => ({
      ...d,
      order: orderMap[d.order_id] || null,
    }));

    return consoleJson({
      rows: list,
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : list.length,
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
      sort: "created_at",
      dir: "desc",
    });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleError("Invalid JSON", 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = designWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    if (data.order_id) {
      const owner = await supaGet("orders", {
        id: "eq." + data.order_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleError("Unknown order", 404);
      }
    }

    const inserted = await supaPostSafe("window_designs", {
      client_id: clientId,
      order_id: data.order_id,
      name: data.name,
      profile_type: data.profile_type,
      dimensions: data.dimensions,
      design: data.design,
      thumbnail_url: data.thumbnail_url,
      model_url: data.model_url,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleError("Insert failed", 500);

    return consoleJson({ design: row }, 201);
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
