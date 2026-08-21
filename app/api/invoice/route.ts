import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supaGet, supaPost, isServiceKeyConfigured } from "@/lib/supabase";

// Collection endpoint for Vitharn's OWN invoices.
//   GET  /api/invoice           -> list (newest first), ?status= & ?client_id= filters
//   POST /api/invoice           -> create a draft, auto-numbered VIT/<FY>/NNNN
//
// Admin-only, same rationale as /api/invoice/[id].
//
// NO TIER GATE HERE, DELIBERATELY. `vitharn_invoices` is Vitharn billing its own
// SaaS clients — it is not a product feature a tenant consumes, and no tenant
// can reach it: `requireAdmin()` rejects every `customer` and `signup` session
// outright. Adding `requireTier(..., "invoicing")` would only ever be evaluated
// for platform admins, who bypass the paywall by design, so it would be dead
// code that implies a boundary that is actually enforced one line above.
// The tenant-facing GST module at /api/gst_invoices IS tier-gated.

export const runtime = "nodejs";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://effxrwrbsjduvhmorvrq.supabase.co";

/** Calls the FY-counter RPC. Falls back to a timestamp number if the RPC is absent. */
async function nextInvoiceNumber(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_next_vitharn_invoice_number`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (res.ok) {
    const txt = (await res.text()).trim();
    const val = txt.replace(/^"|"$/g, "");
    if (val && val !== "null") return val;
  }
  // Migration 005 not applied yet — never block invoicing on it.
  const d = new Date();
  const fy = d.getMonth() + 1 >= 4
    ? `${d.getFullYear()}-${d.getFullYear() + 1}`
    : `${d.getFullYear() - 1}-${d.getFullYear()}`;
  return `VIT/${fy}/${String(Date.now()).slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const url = new URL(request.url);
    const qs: Record<string, string> = {
      select: "*",
      order: "created_at.desc",
      limit: String(Math.min(Number(url.searchParams.get("limit")) || 100, 500)),
    };
    const status = url.searchParams.get("status");
    if (status) qs.status = "eq." + status;
    const clientId = url.searchParams.get("client_id");
    if (clientId) qs.client_id = "eq." + clientId;

    const rows = await supaGet("vitharn_invoices", qs);
    return json({ invoices: Array.isArray(rows) ? rows : [] });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);
    if (!isServiceKeyConfigured()) return json({ error: "no service key" }, 500);

    const p = await request.json();

    const items = Array.isArray(p.items) ? p.items : [];
    if (!items.length) return json({ error: "at least one line item is required" }, 400);

    const subtotal = items.reduce(
      (s: number, it: any) => s + (Number(it.amount) || 0),
      0,
    );

    const today = new Date();
    const invoiceDate = String(p.invoice_date || today.toISOString().slice(0, 10));
    // Default terms: net 7 — matches the contract's payment window.
    const dueDate =
      p.due_date ??
      new Date(new Date(invoiceDate).getTime() + 7 * 86400000).toISOString().slice(0, 10);

    const invoiceNumber = String(p.invoice_number || "").trim() || (await nextInvoiceNumber());

    const created = await supaPost("vitharn_invoices", {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      payment_terms: String(p.payment_terms || "Due on receipt"),
      client_id: p.client_id || null,
      client_name: String(p.client_name || ""),
      client_company: String(p.client_company || ""),
      client_address: String(p.client_address || ""),
      client_email: String(p.client_email || ""),
      client_phone: String(p.client_phone || ""),
      subtotal,
      // GST is NIL — turnover below the Rs.20L threshold (Sec 22, CGST Act 2017).
      gst_rate: 0,
      gst_amount: 0,
      total: subtotal,
      notes: String(p.notes || ""),
      status: "draft",
    });

    const row = Array.isArray(created) ? created[0] : created;
    if (!row?.id) return json({ error: "insert returned no row" }, 500);

    await supaPost(
      "vitharn_invoice_items",
      items.map((it: any, i: number) => ({
        invoice_id: row.id,
        sno: it.sno ?? i + 1,
        description: String(it.description || ""),
        details: String(it.details || ""),
        qty: Number(it.qty) || 1,
        amount: Number(it.amount) || 0,
      })),
    );

    return json({ success: true, id: row.id, invoice_number: invoiceNumber, total: subtotal }, 201);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
