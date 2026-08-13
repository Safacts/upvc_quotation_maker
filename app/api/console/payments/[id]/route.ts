import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaDelete, supaPatch, supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/console/payments/[id] — get a single payment.
 * DELETE /api/console/payments/[id] — void a payment and recalculate quotation payment_status.
 */

async function loadPayment(id: string): Promise<{ id: string; client_id: string; quotation_id: string | null } | null> {
  const rows = await supaGet("payments", {
    id: "eq." + id,
    select: "id,client_id,quotation_id",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function recalculatePaymentStatus(quotationId: string, clientId: string) {
  try {
    const payments = await supaGet("payments", {
      quotation_id: "eq." + quotationId,
      client_id: "eq." + clientId,
      select: "amount",
    });

    const totalPaid = (Array.isArray(payments) ? payments : []).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0,
    );

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
    // Best-effort
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("payments", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select: "id,quotation_id,customer_id,customer_name,amount,method,reference,note,paid_at,created_at",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }

    return consoleJson({ payment: rows[0] });
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

    const payment = await loadPayment(id);
    if (!payment) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && payment.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }

    const quotationId = payment.quotation_id;

    await supaDelete("payments", {
      id: "eq." + id,
      client_id: "eq." + payment.client_id,
    });

    // Recalculate payment_status on the linked quotation
    if (quotationId) {
      await recalculatePaymentStatus(quotationId, payment.client_id);
    }

    return consoleJson({ ok: true, id });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
