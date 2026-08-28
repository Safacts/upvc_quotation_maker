import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/invoices — list GST tax invoices for tenant.
 * POST /api/console/invoices — create GST tax invoice (direct or from quotation).
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const totalCount = await supaCount("gst_invoices", {
      client_id: "eq." + gate.clientId,
    });

    const rows = await supaGet("gst_invoices", {
      client_id: "eq." + gate.clientId,
      select: "id,invoice_number,invoice_date,buyer_name,buyer_gstin,taxable_value,cgst_amount,sgst_amount,igst_amount,grand_total,status,created_at,source_quotation_id",
      order: "invoice_date.desc,created_at.desc",
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
    return consoleJson({ rows: [], page: 1, page_size: 50, total_count: 0, total_pages: 1 }, 200);
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

    const buyerName = (body.buyer_name || "").trim();
    if (!buyerName) {
      return consoleJson({ error: "Buyer name is required" }, 400);
    }

    const taxableValue = Number(body.taxable_value) || 0;
    const isInterstate = Boolean(body.is_interstate);
    const gstRate = Number(body.gst_rate) || 18.0;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstAmount = Math.round((taxableValue * (gstRate / 100)) * 100) / 100;
    } else {
      const combined = Math.round((taxableValue * (gstRate / 100)) * 100) / 100;
      const paisa = Math.round(combined * 100);
      cgstAmount = Math.floor(paisa / 2) / 100;
      sgstAmount = Math.round((combined - cgstAmount) * 100) / 100;
    }

    const grandTotal = Math.round((taxableValue + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2, '0')}${(d.getMonth()+1).toString().padStart(2, '0')}${d.getFullYear()}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `GST/${dateStr}/${rand}`;

    const inserted = await supaPost("gst_invoices", {
      client_id: gate.clientId,
      invoice_number: invoiceNumber,
      invoice_date: body.invoice_date || new Date().toISOString().slice(0, 10),
      buyer_name: buyerName,
      buyer_address: body.buyer_address || "",
      buyer_gstin: body.buyer_gstin || "",
      place_of_supply: body.place_of_supply || "Telangana",
      is_interstate: isInterstate,
      taxable_value: taxableValue,
      subtotal: taxableValue,
      cgst_rate: isInterstate ? 0 : gstRate / 2,
      sgst_rate: isInterstate ? 0 : gstRate / 2,
      igst_rate: isInterstate ? gstRate : 0,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      grand_total: grandTotal,
      status: "sent",
      source_quotation_id: body.source_quotation_id || null,
    });

    const invoice = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ invoice: invoice || { invoice_number: invoiceNumber, grand_total: grandTotal } }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
