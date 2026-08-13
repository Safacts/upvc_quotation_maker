import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/customers/[id]/statement — customer statement of account.
 *
 * Combines quotations (won status) and payments for this customer into a
 * chronological statement with running balance.
 */

const MAX_ROWS = 5000;
const PAGE_SIZE = 500;

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    // Verify customer belongs to this tenant
    const custRows = await supaGetAllPaged(
      "customers",
      {
        id: "eq." + id,
        client_id: "eq." + gate.clientId,
        select: "id,name,phone,email,company",
      },
      1,
      1,
    );
    const customer = Array.isArray(custRows.rows) && custRows.rows.length > 0
      ? custRows.rows[0]
      : null;
    if (!customer) {
      return consoleJson({ error: "Customer not found" }, 404);
    }

    // Fetch won quotations linked to this customer
    const { rows: quoteRows } = await supaGetAllPaged(
      "quotation_money",
      {
        client_id: "eq." + gate.clientId,
        customer_id: "eq." + id,
        status: "eq.won",
        select: "id,quote_no,date,grand_total,created_at",
        order: "date.asc,created_at.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    // Fetch payments for this customer
    const { rows: paymentRows } = await supaGetAllPaged(
      "payments",
      {
        client_id: "eq." + gate.clientId,
        customer_id: "eq." + id,
        select: "id,quotation_id,amount,method,reference,paid_at,created_at",
        order: "paid_at.asc,created_at.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    // Build chronological entries
    type StatementEntry = {
      date: string;
      type: "quotation" | "payment";
      reference: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    };

    const entries: StatementEntry[] = [];

    for (const q of (Array.isArray(quoteRows) ? quoteRows : [])) {
      entries.push({
        date: q.date || (q.created_at || "").slice(0, 10),
        type: "quotation",
        reference: q.quote_no || "",
        description: `Quotation ${q.quote_no || ""}`,
        debit: r2(Number(q.grand_total) || 0),
        credit: 0,
        balance: 0,
      });
    }

    for (const p of (Array.isArray(paymentRows) ? paymentRows : [])) {
      const paidAt = p.paid_at || p.created_at || "";
      entries.push({
        date: (paidAt || "").slice(0, 10),
        type: "payment",
        reference: p.reference || "",
        description: `Payment (${p.method || "unknown"})`,
        debit: 0,
        credit: r2(Number(p.amount) || 0),
        balance: 0,
      });
    }

    // Sort chronologically
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

    // Compute running balance
    let runningBalance = 0;
    for (const entry of entries) {
      runningBalance += entry.debit - entry.credit;
      entry.balance = r2(runningBalance);
    }

    // Summary
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

    return consoleJson({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        company: customer.company,
      },
      entries,
      summary: {
        total_debit: r2(totalDebit),
        total_credit: r2(totalCredit),
        balance: r2(totalDebit - totalCredit),
        entry_count: entries.length,
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
