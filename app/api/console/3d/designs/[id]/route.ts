import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaPatchSafe, supaDelete } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_TYPES = ["uPVC", "aluminum"] as const;

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("window_designs", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const designUpdateSchema = z.object({
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
  profile_type: z.enum(PROFILE_TYPES).optional(),
  dimensions: z
    .object({
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
      configuration: z.enum(["sliding", "casement", "tilt_turn", "fixed"]).optional(),
    })
    .strict()
    .optional(),
  design: z
    .object({
      frames: z.array(z.any()),
      panels: z.array(z.any()),
    })
    .optional(),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;
    const { id } = await params;

    const rows = await supaGet("window_designs", {
      id: "eq." + id,
      client_id: "eq." + clientId,
      select: DESIGN_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleError("Not found", 404);
    }
    const design = rows[0];

    let order = null;
    if (design.order_id) {
      const orders = await supaGet("orders", {
        id: "eq." + design.order_id,
        client_id: "eq." + clientId,
        select: "id,order_number,status,total_amount,customer_id",
        limit: 1,
      });
      if (Array.isArray(orders) && orders.length > 0) {
        order = orders[0];
      }
    }

    const renders = await supaGet("renders", {
      design_id: "eq." + id,
      client_id: "eq." + clientId,
      select:
        "id,render_type,url,width,height,render_time_ms,status,error_message,created_at",
      order: "render_type.asc,created_at.desc",
    });

    return consoleJson({
      design,
      order,
      renders: Array.isArray(renders) ? renders : [],
    });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
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
      return consoleError("Invalid JSON", 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleError("Not found", 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleError("Not found", 404);
    }
    const clientId = owner.client_id;

    const parsed = designUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const patchData: Record<string, any> = {};
    if (data.order_id !== undefined) patchData.order_id = data.order_id;
    if (data.name !== undefined) patchData.name = data.name;
    if (data.profile_type !== undefined) patchData.profile_type = data.profile_type;
    if (data.dimensions !== undefined) patchData.dimensions = data.dimensions;
    if (data.design !== undefined) patchData.design = data.design;
    if (data.thumbnail_url !== undefined) patchData.thumbnail_url = data.thumbnail_url;
    if (data.model_url !== undefined) patchData.model_url = data.model_url;

    if (Object.keys(patchData).length === 0) {
      return consoleError("No fields to update", 400);
    }

    await supaPatchSafe(
      "window_designs",
      { id: "eq." + id, client_id: "eq." + clientId },
      patchData,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleError("Not found", 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleError("Not found", 404);
    }

    await supaDelete("window_designs", {
      id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
