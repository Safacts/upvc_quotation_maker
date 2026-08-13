import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe, supaPostSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["confirmed", "production", "dispatched", "installed", "completed", "cancelled"] as const;

const orderQuerySchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "order_number", "total_amount", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const orderWriteSchema = z.object({
  quotation_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  customer_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  order_number: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  expected_delivery: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  notes: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  total_amount: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }),
  paid_amount: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }),
});

const LIST_SELECT =
  "id,order_number,status,total_amount,paid_amount,expected_delivery,actual_delivery,created_at,updated_at," +
  "customer_id,quotation_id,notes";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = orderQuerySchema.safeParse({
      status: url.searchParams.get("status"),
      q: url.searchParams.get("q"),
      page: url.searchParams.get("page"),
      page_size: url.searchParams.get("page_size"),
      sort: url.searchParams.get("sort"),
      dir: url.searchParams.get("dir"),
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, q, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filters.status = "eq." + statuses[0];
      } else if (statuses.length > 1) {
        filters.status = "in.(" + statuses.join(",") + ")";
      }
    }
    if (q) {
      const safe = q.replace(/[(),*]/g, " ").trim();
      if (safe) {
        filters.or = `(order_number.ilike.*${safe}*,notes.ilike.*${safe}*)`;
      }
    }

    const totalCount = await supaCount("orders", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("orders", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const orderIds = (Array.isArray(rows) ? rows : []).map((r: any) => r.id);
    let customerMap: Record<string, any> = {};
    let productionMap: Record<string, any> = {};

    if (orderIds.length) {
      const allCustomerIds = [...new Set((Array.isArray(rows) ? rows : []).map((r: any) => r.customer_id).filter(Boolean))];
      if (allCustomerIds.length) {
        const custs = await supaGet("customers", {
          id: "in.(" + allCustomerIds.join(",") + ")",
          client_id: "eq." + clientId,
          select: "id,name,phone",
        });
        if (Array.isArray(custs)) {
          customerMap = Object.fromEntries(custs.map((c: any) => [c.id, c]));
        }
      }

      const prods = await supaGet("production_orders", {
        order_id: "in.(" + orderIds.join(",") + ")",
        client_id: "eq." + clientId,
        select: "order_id,stage,status",
      });
      if (Array.isArray(prods)) {
        for (const p of prods) {
          if (!productionMap[p.order_id]) {
            productionMap[p.order_id] = [];
          }
          productionMap[p.order_id].push({ stage: p.stage, status: p.status });
        }
      }
    }

    const list = (Array.isArray(rows) ? rows : []).map((r: any) => {
      const cust = customerMap[r.customer_id];
      return {
        ...r,
        customer_name: cust?.name || "",
        customer_phone: cust?.phone || "",
        production: productionMap[r.id] || [],
      };
    });

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
    const clientId = gate.clientId;

    const parsed = orderWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    if (data.customer_id) {
      const owner = await supaGet("customers", {
        id: "eq." + data.customer_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleJson({ error: "Unknown customer" }, 404);
      }
    }

    if (data.quotation_id) {
      const qOwner = await supaGet("quotations", {
        id: "eq." + data.quotation_id,
        client_id: "eq." + clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(qOwner) || qOwner.length === 0) {
        return consoleJson({ error: "Unknown quotation" }, 404);
      }
    }

    let totalAmount = data.total_amount;
    let customerId = data.customer_id;

    if (data.quotation_id) {
      const qRows = await supaGet("quotations", {
        id: "eq." + data.quotation_id,
        client_id: "eq." + clientId,
        select: "id,customer_id,customer_name,contact_no",
        limit: 1,
      });
      if (Array.isArray(qRows) && qRows.length > 0) {
        const q = qRows[0];
        if (!customerId) customerId = q.customer_id;
        if (!totalAmount) {
          try {
            const money = await supaGet("quotation_money", {
              id: "eq." + data.quotation_id,
              client_id: "eq." + clientId,
              select: "grand_total",
              limit: 1,
            });
            if (Array.isArray(money) && money.length > 0) {
              totalAmount = Number(money[0].grand_total) || 0;
            }
          } catch {}
        }
      }
    }

    let orderNumber = data.order_number;
    if (!orderNumber) {
      const prefix = String(clientId).toUpperCase();
      const d = new Date();
      const datePart = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
      const existing = await supaGet("orders", {
        client_id: "eq." + clientId,
        select: "order_number",
        order: "created_at.desc",
        limit: 100,
      });
      let maxSeq = 0;
      if (Array.isArray(existing)) {
        for (const r of existing) {
          const m = String(r?.order_number || "").match(/-(\d+)$/);
          if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
          }
        }
      }
      orderNumber = `${prefix}-ORD-${datePart}-${String(maxSeq + 1).padStart(4, "0")}`;
    }

    const inserted = await supaPostSafe("orders", {
      client_id: clientId,
      customer_id: customerId || null,
      quotation_id: data.quotation_id || null,
      order_number: orderNumber,
      status: "confirmed",
      total_amount: totalAmount,
      paid_amount: data.paid_amount,
      expected_delivery: data.expected_delivery || null,
      notes: data.notes,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ order: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
