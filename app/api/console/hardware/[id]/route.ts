import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaDelete, supaGetSafe, supaPatchSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HARDWARE_TYPES = ["handle", "lock", "hinge", "roller", "bracket", "seal"] as const;

const DETAIL_SELECT =
  "id,name,type,brand,model,quantity,unit,reorder_level,cost_per_unit,supplier,created_at";

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("hardware", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const updateSchema = z.object({
  name: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 200, { message: "Name must be 200 characters or fewer" }),
  type: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim()),
  brand: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim()),
  model: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim()),
  quantity: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
    }),
  unit: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim() || undefined),
  reorder_level: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
    }),
  cost_per_unit: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
    }),
  supplier: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim()),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGetSafe("hardware", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }

    return consoleJson({ hardware: rows[0] });
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

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    const patchData: Record<string, any> = {};
    if (data.name !== undefined) patchData.name = data.name;
    if (data.type !== undefined) {
      if (data.type && !HARDWARE_TYPES.includes(data.type as any)) {
        return consoleJson({ error: `Invalid type. Must be one of: ${HARDWARE_TYPES.join(", ")}` }, 400);
      }
      patchData.type = data.type;
    }
    if (data.brand !== undefined) patchData.brand = data.brand;
    if (data.model !== undefined) patchData.model = data.model;
    if (data.quantity !== undefined) patchData.quantity = data.quantity;
    if (data.unit !== undefined) patchData.unit = data.unit;
    if (data.reorder_level !== undefined) patchData.reorder_level = data.reorder_level;
    if (data.cost_per_unit !== undefined) patchData.cost_per_unit = data.cost_per_unit;
    if (data.supplier !== undefined) patchData.supplier = data.supplier;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatchSafe(
      "hardware",
      { id: "eq." + id, client_id: "eq." + clientId },
      patchData,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }

    await supaDelete("hardware", {
      id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
