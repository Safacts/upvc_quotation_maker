import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaDelete, supaGetSafe, supaPatchSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAIL_SELECT =
  "id,order_id,production_order_id,profile_type,stock_length_mm,cuts,optimized_cuts,wastage_percent,status,created_at";

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("cutting_lists", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const updateSchema = z.object({
  status: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? undefined : s;
  }),
});

const VALID_STATUSES = ["pending", "approved", "cutting", "completed"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGetSafe("cutting_lists", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const cuttingList = rows[0];

    let order = null;
    if (cuttingList.order_id) {
      const orders = await supaGet("orders", {
        id: "eq." + cuttingList.order_id,
        client_id: "eq." + gate.clientId,
        select: "id,order_number,status,customer_id",
        limit: 1,
      });
      if (Array.isArray(orders) && orders.length > 0) {
        order = orders[0];
      }
    }

    let productionOrder = null;
    if (cuttingList.production_order_id) {
      const prods = await supaGet("production_orders", {
        id: "eq." + cuttingList.production_order_id,
        client_id: "eq." + gate.clientId,
        select: "id,stage,status,assigned_to",
        limit: 1,
      });
      if (Array.isArray(prods) && prods.length > 0) {
        productionOrder = prods[0];
      }
    }

    return consoleJson({
      cutting_list: cuttingList,
      order,
      production_order: productionOrder,
    });
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
    if (data.status !== undefined) {
      if (!VALID_STATUSES.includes(data.status)) {
        return consoleJson({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
      }
      patchData.status = data.status;
    }

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatchSafe(
      "cutting_lists",
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

    await supaDelete("cutting_lists", {
      id: "eq." + id,
      client_id: "eq." + owner.client_id,
    });

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
