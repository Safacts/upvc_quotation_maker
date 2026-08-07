import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet, supaPatch, supaDelete, isServiceKeyConfigured } from "@/lib/supabase";
import { buildInvoicePdf, type InvoiceData } from "@/lib/invoice-pdf";
import { sendInvoiceEmail, invoiceFilename } from "@/lib/email-service";

// Vitharn's OWN invoices (Vitharn -> its SaaS clients), NIL GST.
// Backed by `vitharn_invoices` (migration 005) — distinct from the per-tenant
// `gst_invoices` module in /api/gst_invoices.
//
//   GET    /api/invoice/<id>          -> JSON
//   GET    /api/invoice/<id>?pdf=1    -> application/pdf (inline)
//   GET    /api/invoice/<id>?download=1 -> application/pdf (attachment)
//   POST   /api/invoice/<id>  {action:"send"|"mark_paid"|"mark_sent"}
//   PATCH  /api/invoice/<id>  -> update header fields / items
//   DELETE /api/invoice/<id>
//
// SECURITY: every method is admin-only. These are Vitharn's internal financial
// records — a tenant must never read another party's invoice, so we deliberately
// do NOT expose a client-scoped path here. No CORS wildcard either: this route
// is same-origin admin surface only, unlike the Flutter-facing endpoints.

export const runtime = "nodejs";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

type Row = Record<string, any>;

function toInvoiceData(inv: Row, items: Row[]): InvoiceData {
  return {
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    paymentTerms: inv.payment_terms,
    clientName: inv.client_name || "",
    clientCompany: inv.client_company || "",
    clientAddress: inv.client_address || "",
    clientEmail: inv.client_email || "",
    clientPhone: inv.client_phone || "",
    notes: inv.notes || "",
    paid: inv.status === "paid",
    items: (items || []).map((it) => ({
      description: it.description || "",
      details: it.details || "",
      qty: Number(it.qty) || 1,
      amount: Number(it.amount) || 0,
    })),
  };
}

async function loadInvoice(id: string): Promise<{ inv: Row; items: Row[] } | null> {
  const rows = await supaGet("vitharn_invoices", { id: "eq." + id, select: "*" });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const items = await supaGet("vitharn_invoice_items", {
    invoice_id: "eq." + id,
    select: "*",
    order: "sno.asc",
  });
  return { inv: rows[0], items: Array.isArray(items) ? items : [] };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    const found = await loadInvoice(id);
    if (!found) return json({ error: "not found" }, 404);

    const url = new URL(request.url);
    const wantsPdf = url.searchParams.has("pdf") || url.searchParams.has("download");
    if (!wantsPdf) return json({ invoice: found.inv, items: found.items });

    const data = toInvoiceData(found.inv, found.items);
    const pdf = await buildInvoicePdf(data);
    const disposition = url.searchParams.has("download") ? "attachment" : "inline";

    // Buffer.from keeps the exact byte length; NextResponse handles the stream.
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${invoiceFilename(data.invoiceNumber)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    const found = await loadInvoice(id);
    if (!found) return json({ error: "not found" }, 404);

    if (action === "send") {
      const to = String(body.to || found.inv.client_email || "").trim();
      if (!to) return json({ error: "no recipient email on this invoice" }, 400);

      const data = toInvoiceData(found.inv, found.items);
      const result = await sendInvoiceEmail({
        invoice: data,
        to,
        message: body.message ? String(body.message) : undefined,
      });
      if (!result.sent) return json({ success: false, error: result.error }, 502);

      // Only advance draft -> sent; never regress a paid invoice.
      if (found.inv.status === "draft") {
        await supaPatch(
          "vitharn_invoices",
          { id: "eq." + id },
          { status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        );
      }
      return json({ success: true, sent_to: to });
    }

    if (action === "mark_paid") {
      const paidOn = String(body.paid_on || new Date().toISOString().slice(0, 10));
      await supaPatch(
        "vitharn_invoices",
        { id: "eq." + id },
        { status: "paid", paid_on: paidOn, updated_at: new Date().toISOString() },
      );
      return json({ success: true, status: "paid", paid_on: paidOn });
    }

    if (action === "mark_sent") {
      await supaPatch(
        "vitharn_invoices",
        { id: "eq." + id },
        { status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      );
      return json({ success: true, status: "sent" });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    const p = await request.json();

    // invoice_number is intentionally NOT patchable: it comes from the FY
    // counter RPC and must stay stable + gapless for audit purposes.
    const fields = [
      "invoice_date", "due_date", "payment_terms", "client_id", "client_name",
      "client_company", "client_address", "client_email", "client_phone",
      "notes", "status", "paid_on",
    ];
    const update: Row = {};
    for (const f of fields) if (p[f] !== undefined) update[f] = p[f];

    if (Array.isArray(p.items)) {
      await supaDelete("vitharn_invoice_items", { invoice_id: "eq." + id });
      if (p.items.length) {
        const { supaPost } = await import("@/lib/supabase");
        await supaPost(
          "vitharn_invoice_items",
          p.items.map((it: Row, i: number) => ({
            invoice_id: id,
            sno: it.sno ?? i + 1,
            description: String(it.description || ""),
            details: String(it.details || ""),
            qty: Number(it.qty) || 1,
            amount: Number(it.amount) || 0,
          })),
        );
      }
      const subtotal = p.items.reduce((s: number, it: Row) => s + (Number(it.amount) || 0), 0);
      update.subtotal = subtotal;
      update.gst_rate = 0;
      update.gst_amount = 0;
      update.total = subtotal;
    }

    if (Object.keys(update).length) {
      update.updated_at = new Date().toISOString();
      await supaPatch("vitharn_invoices", { id: "eq." + id }, update);
    }

    return json({ success: true });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const { id } = await params;
    await supaDelete("vitharn_invoice_items", { invoice_id: "eq." + id });
    await supaDelete("vitharn_invoices", { id: "eq." + id });
    return json({ success: true, deleted: id });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
