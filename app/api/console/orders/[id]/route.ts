import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaDelete, supaGetSafe, supaPatchSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAIL_SELECT =
  "id,order_number,status,total_amount,paid_amount,balance,expected_delivery," +
  "actual_delivery,notes,created_at,updated_at,customer_id,quotation_id";

async function loadOwner(id: string): Promise<{ id: string; client_id: string } | null> {
  const rows = await supaGet("orders", {
    id: "eq." + id,
    select: "id,client_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

const orderUpdateSchema = z.object({
  customer_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  order_number: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  expected_delivery: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  actual_delivery: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  notes: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  total_amount: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
  }),
  paid_amount: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
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

    const rows = await supaGetSafe("orders", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: DETAIL_SELECT,
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const order = rows[0];

    let customer = null;
    if (order.customer_id) {
      const custs = await supaGet("customers", {
        id: "eq." + order.customer_id,
        client_id: "eq." + gate.clientId,
        select: "id,name,phone,email,address,company,gst_number",
        limit: 1,
      });
      if (Array.isArray(custs) && custs.length > 0) {
        customer = custs[0];
      }
    }

    let quotation = null;
    if (order.quotation_id) {
      const qs = await supaGetSafe("quotations", {
        id: "eq." + order.quotation_id,
        client_id: "eq." + gate.clientId,
        select: "id,quote_no,date,status",
        limit: 1,
      });
      if (Array.isArray(qs) && qs.length > 0) {
        quotation = qs[0];
      }
    }

    const productions = await supaGet("production_orders", {
      order_id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,stage,status,assigned_to,batch_id,priority,started_at,completed_at,notes,created_at",
      order: "created_at.asc",
    });

    return consoleJson({
      order,
      customer,
      quotation,
      production_orders: Array.isArray(productions) ? productions : [],
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

    const parsed = orderUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    if (data.customer_id) {
      const cust = await supaGet("customers", {
        id: "eq." + data.customer_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(cust) || cust.length === 0) {
        return consoleJson({ error: "Unknown customer" }, 404);
      }
    }

    const patchData: Record<string, any> = {};
    if (data.customer_id !== undefined) patchData.customer_id = data.customer_id;
    if (data.order_number) patchData.order_number = data.order_number;
    if (data.expected_delivery !== undefined) patchData.expected_delivery = data.expected_delivery;
    if (data.actual_delivery !== undefined) patchData.actual_delivery = data.actual_delivery;
    if (data.notes !== undefined) patchData.notes = data.notes;
    if (data.total_amount !== undefined) patchData.total_amount = data.total_amount;
    if (data.paid_amount !== undefined) patchData.paid_amount = data.paid_amount;

    if (Object.keys(patchData).length === 0) {
      return consoleJson({ error: "No fields to update" }, 400);
    }

    await supaPatchSafe(
      "orders",
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

    await supaPatch(
      "orders",
      { id: "eq." + id, client_id: "eq." + owner.client_id },
      { status: "cancelled" },
    );

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
