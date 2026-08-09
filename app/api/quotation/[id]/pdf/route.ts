import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-client";
import { quotationTotals } from "@/lib/pricing";
import { buildQuotationPdf, type QuotationPdfData } from "@/lib/quotation-pdf";

// pdf-lib will NOT run on Edge — same constraint as /api/invoice/[id].
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SECRET = process.env.QUOTE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * GET /api/quotation/[id]/pdf?token=<hmac> — PUBLIC quotation PDF download.
 *
 * This is the customer-facing twin of
 * `/api/console/quotations/[id]/pdf` (which is behind the console session).
 * Same generator, same `src/lib/pricing.ts` math, so the file the customer
 * downloads is byte-for-byte the document the fabricator sees.
 *
 * WHY THIS EXISTS: the public quote page's "Download / Print PDF" button used
 * to call `window.print()`. That opens the browser's print dialog — it does not
 * produce a .pdf file. On mobile Chrome/WhatsApp's in-app browser (which is how
 * essentially every one of these links is opened) the result ranges from a
 * mangled screenshot of the DOM to nothing happening at all. The customer could
 * never actually obtain the quotation document.
 *
 * AUTH: the same 16-hex truncated HMAC that gates the JSON route. No session —
 * by design, the recipient of a WhatsApp link has no account. The token is
 * verified in CONSTANT TIME and BEFORE any database read, so an invalid token
 * cannot be used to probe which quotation ids exist.
 */

function verifyToken(quotationId: string, token: string | null): boolean {
  if (!TOKEN_SECRET || !token) return false;
  const expected = createHmac("sha256", TOKEN_SECRET).update(quotationId).digest("hex").slice(0, 16);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Strip anything that could break out of a Content-Disposition header. */
function safeFilename(s: string): string {
  return String(s || "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "quotation";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Fail closed BEFORE touching the database.
    if (!verifyToken(id, token)) {
      return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
    }

    const { data: qRow, error } = await supabaseAdmin
      .from("quotations")
      .select(
        "id,quote_no,date,customer_name,reference,address,contact_no,email," +
          "supplier_company,transport_cost,include_gst,gst_percentage,status,client_id",
      )
      .eq("id", id)
      .eq("deleted", false)
      .single();

    if (error || !qRow) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    // The generated Supabase types cannot narrow a runtime-built select string,
    // so the row widens to GenericStringError. Every field is re-coerced below
    // via num()/String() anyway, which is where the real safety comes from.
    const q = qRow as Record<string, any>;

    const { data: measuredRows } = await supabaseAdmin
      .from("measured_items")
      .select("code,description,glass,width,height,units,rate")
      .eq("quotation_id", id)
      .order("created_at");

    const { data: unmeasuredRows } = await supabaseAdmin
      .from("unmeasured_items")
      .select("description,units,rate")
      .eq("quotation_id", id)
      .order("created_at");

    const measured = (measuredRows || []).map((m: any) => ({
      code: String(m.code || ""),
      description: String(m.description || ""),
      glass: String(m.glass || ""),
      width: num(m.width),
      height: num(m.height),
      units: num(m.units, 1),
      rate: num(m.rate),
    }));
    const unmeasured = (unmeasuredRows || []).map((u: any) => ({
      description: String(u.description || ""),
      units: num(u.units, 1),
      rate: num(u.rate),
    }));

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("config")
      .eq("id", q.client_id)
      .single();

    const raw = client?.config;
    const config: Record<string, any> =
      typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});

    // Money from pricing.ts ONLY — never inline (w/304.8)*(h/304.8).
    const totals = quotationTotals(q, measured, unmeasured);

    // Explicit field-by-field mapping. `clients.config` is a jsonb blob that
    // also carries credential material (portalPasswordHash, supabaseAnonKey);
    // we name every field we take so a future key added to the blob cannot
    // leak into a customer-facing document by default.
    const pdfData: QuotationPdfData = {
      quoteNo: String(q.quote_no || ""),
      date: q.date || new Date(),
      customerName: String(q.customer_name || ""),
      contactNo: String(q.contact_no || ""),
      email: String(q.email || ""),
      address: String(q.address || ""),
      reference: String(q.reference || ""),
      supplierCompany: String(q.supplier_company || ""),
      measured,
      unmeasured,
      totals,
      companyName: String(config.companyName || config.appName || q.client_id),
      companyAddress: String(config.companyAddress || ""),
      companyProprietor: String(config.companyProprietor || ""),
      companyContact: String(config.companyContact || ""),
      gstNumber: String(config.gstNumber || ""),
      bankName: String(config.bankName || ""),
      bankBranch: String(config.bankBranch || ""),
      bankAccountNo: String(config.bankAccountNo || ""),
      bankIfsc: String(config.bankIfsc || ""),
      termsAndConditions: Array.isArray(config.termsAndConditions)
        ? config.termsAndConditions.map(String)
        : [],
      logoUrl: String(config.logoUrl || ""),
      watermarkUrl: String(config.invoiceBackgroundLogoUrl || config.logoUrl || ""),
    };

    const bytes = await buildQuotationPdf(pdfData);
    const filename = `Quotation_${safeFilename(String(q.quote_no || id))}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Never let a shared/ISP cache hold a customer's priced quotation.
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
