import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaPatch, supabaseRpc } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/payments — payment list, paged + filterable.
 * POST /api/console/payments — record a payment and update quotation payment_status.
 */

const PAYMENT_METHODS = ["upi", "cash", "bank_transfer", "card", "cheque", "other"] as const;

const paymentWriteSchema = z.object({
  quotation_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  customer_id: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = (v ?? "").toString().trim();
      return s === "" ? null : s;
    }),
  customer_name: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  amount: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    })
    .refine((n) => n > 0, { message: "Amount must be greater than 0" }),
  method: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .refine((v) => (PAYMENT_METHODS as readonly string[]).includes(v), {
      message: `Method must be one of: ${PAYMENT_METHODS.join(", ")}`,
    }),
  reference: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  note: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
  paid_at: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim()),
});

async function recalculatePaymentStatus(quotationId: string, clientId: string) {
  try {
    // Sum all payments for this quotation
    const payments = await supaGet("payments", {
      quotation_id: "eq." + quotationId,
      client_id: "eq." + clientId,
      select: "amount",
    });

    const totalPaid = (Array.isArray(payments) ? payments : []).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0,
    );

    // Get quotation grand_total from quotation_money view
    const qRows = await supaGet("quotation_money", {
      id: "eq." + quotationId,
      client_id: "eq." + clientId,
      select: "grand_total",
      limit: 1,
    });

    const grandTotal = Array.isArray(qRows) && qRows.length > 0
      ? Number(qRows[0].grand_total) || 0
      : 0;

    let paymentStatus = "unpaid";
    if (totalPaid > 0 && totalPaid >= grandTotal) {
      paymentStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partial";
    }

    await supaPatch(
      "quotations",
      { id: "eq." + quotationId, client_id: "eq." + clientId },
      { amount_paid: totalPaid, payment_status: paymentStatus },
    );
  } catch {
    // Best-effort recalculation; do not fail the payment write
  }
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const quotationId = (url.searchParams.get("quotation_id") || "").trim();
    const customerId = (url.searchParams.get("customer_id") || "").trim();
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const filters: Record<string, string | number | boolean> = {};
    if (quotationId) filters.quotation_id = "eq." + quotationId;
    if (customerId) filters.customer_id = "eq." + customerId;

    const totalCount = await supaCount("payments", {
      client_id: "eq." + gate.clientId,
      ...filters,
    });
    const rows = await supaGet("payments", {
      client_id: "eq." + gate.clientId,
      ...filters,
      select: "id,quotation_id,customer_id,customer_name,amount,method,reference,note,paid_at,created_at",
      order: "paid_at.desc,id.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
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

    const parsed = paymentWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    // Resolve customer_name: prefer explicit, fall back to quotation snapshot
    let customerName = data.customer_name;
    if (!customerName && data.quotation_id) {
      const qRows = await supaGet("quotations", {
        id: "eq." + data.quotation_id,
        client_id: "eq." + gate.clientId,
        select: "customer_name",
        limit: 1,
      });
      if (Array.isArray(qRows) && qRows.length > 0) {
        customerName = qRows[0].customer_name || "";
      }
    }

    const inserted = await supaPost("payments", {
      client_id: gate.clientId,
      quotation_id: data.quotation_id || null,
      customer_id: data.customer_id || null,
      customer_name: customerName,
      amount: data.amount,
      method: data.method,
      reference: data.reference,
      note: data.note,
      paid_at: data.paid_at || new Date().toISOString(),
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    // Recalculate payment_status on the linked quotation
    if (data.quotation_id) {
      await recalculatePaymentStatus(data.quotation_id, gate.clientId);
    }

    return consoleJson({ payment: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
