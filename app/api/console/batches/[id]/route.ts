import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaGetSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("batches", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const batchUpdateSchema = z.object({
  status: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? undefined : s;
  }),
  batch_number: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? undefined : s;
  }),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGetSafe("batches", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,batch_number,status,total_orders,completed_orders,created_at,completed_at",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const batch = rows[0];

    const productions = await supaGet("production_orders", {
      batch_id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,order_id,stage,status,assigned_to,priority,started_at,completed_at,created_at",
      order: "priority.desc,created_at.asc",
    });

    const orderIds = [...new Set((Array.isArray(productions) ? productions : []).map((p: any) => p.order_id).filter(Boolean))];
    let orderMap: Record<string, any> = {};

    if (orderIds.length) {
      const orders = await supaGet("orders", {
        id: "in.(" + orderIds.join(",") + ")",
        client_id: "eq." + gate.clientId,
        select: "id,order_number,status,customer_id",
      });
      if (Array.isArray(orders)) {
        const custIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
        let custMap: Record<string, any> = {};
        if (custIds.length) {
          const custs = await supaGet("customers", {
            id: "in.(" + custIds.join(",") + ")",
            client_id: "eq." + gate.clientId,
            select: "id,name",
          });
          if (Array.isArray(custs)) {
            custMap = Object.fromEntries(custs.map((c: any) => [c.id, c]));
          }
        }
        for (const o of orders) {
          orderMap[o.id] = {
            order_number: o.order_number,
            status: o.status,
            customer_name: custMap[o.customer_id]?.name || "",
          };
        }
      }
    }

    const productionsList = (Array.isArray(productions) ? productions : []).map((p: any) => ({
      ...p,
      order: orderMap[p.order_id] || null,
    }));

    return consoleJson({ batch, production_orders: productionsList });
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

    const parsed = batchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    const VALID_BATCH_STATUSES = ["planning", "in_progress", "completed"];
    const patchData: Record<string, any> = {};
    if (data.status !== undefined) {
      if (!VALID_BATCH_STATUSES.includes(data.status)) {
        return consoleJson({ error: `Invalid status. Must be one of: ${VALID_BATCH_STATUSES.join(", ")}` }, 400);
      }
      patchData.status = data.status;
      if (data.status === "completed") {
        patchData.completed_at = new Date().toISOString();
      }
    }
    if (data.batch_number !== undefined) patchData.batch_number = data.batch_number;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatch(
      "batches",
      { id: "eq." + id, client_id: "eq." + clientId },
      patchData,
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
