import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import { hashQuotationToken } from "@/lib/quotation-token";
import { measuredLineSqft, measuredLineTotal, quotationTotals } from "@/lib/pricing";
import { buildQuotationPdf, type QuotationPdfData } from "@/lib/quotation-pdf";
import { Resvg } from "@resvg/resvg-js";
import { injectVaishnaviSvg, type VaishnaviQuote } from "@/lib/vaishnavi-svg-inject";
import { PDFDocument } from "pdf-lib";

// pdf-lib will NOT run on Edge — same constraint as /api/invoice/[id].
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


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
 * AUTH: the same opaque stored bearer token that gates the JSON route. No session —
 * by design, the recipient of a WhatsApp link has no account. The token is
 * verified in CONSTANT TIME and BEFORE any database read, so an invalid token
 * cannot be used to probe which quotation ids exist.
 */

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
    const supabaseAdmin = getSupabaseAdmin();
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Verify the opaque token before loading quotation data.
    if (!token) {
      return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
    }

    const { data: tokenRow } = await supabaseAdmin
      .from("quotation_share_tokens")
      .select("quotation_id")
      .eq("quotation_id", id)
      .eq("token_hash", hashQuotationToken(token))
      .gt("expires_at", new Date().toISOString())
      .is("revoked_at", null)
      .maybeSingle();

    if (!tokenRow) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
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

    // Vaishnavi follows Flutter's purple OASIS estimate + CAD (client-specific)
    const normalizedVaish = String(q.client_id).toLowerCase().replace(/[^a-z0-9]/g, "");
    const isVaishnavi = normalizedVaish === "vaishnavi" || normalizedVaish === "vaishnaviupvcwindowsanddoors" || normalizedVaish.includes("vaishnavi");
    if (isVaishnavi) {
      const TEMPLATES = join(process.cwd(), "src", "templates", "vaishnavi");
      const FONTS = [join(TEMPLATES, "fonts", "Arimo.ttf"), join(TEMPLATES, "fonts", "Tinos-Regular.ttf"), join(TEMPLATES, "fonts", "Tinos-Bold.ttf")];
      const amountInWords = (() => {
        const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
        const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
        const two = (x:number):string=> x<20 ? ones[x] : tens[Math.floor(x/10)] + (x%10!==0 ? "-"+ones[x%10] : "");
        const three = (x:number):string=> x>=100 ? ones[Math.floor(x/100)]+" Hundred"+(x%100!==0 ? " "+two(x%100) : "") : two(x);
        const rupees = Math.floor(Math.abs(totals.grandTotal));
        const paise = Math.round((Math.abs(totals.grandTotal)-rupees)*100);
        if (rupees===0 && paise===0) return "RUPEES ZERO ONLY";
        const parts:string[]=[]; let rem=rupees;
        if (rem>=10000000){ parts.push(`${three(Math.floor(rem/10000000))} Crore`); rem%=10000000; }
        if (rem>=100000){ parts.push(`${three(Math.floor(rem/100000))} Lakh`); rem%=100000; }
        if (rem>=1000){ parts.push(`${three(Math.floor(rem/1000))} Thousand`); rem%=1000; }
        if (rem>0) parts.push(three(rem));
        let s=parts.join(" ")+" Rupees"; if(paise>0) s+=` and ${two(paise)} Paise`; return (s+" Only").toUpperCase();
      })();
      const vaishItems = measured.map((m:any)=> ({ description:m.description, width:m.width, height:m.height, units:m.units, totalSft: measuredLineSqft(m), rate:m.rate, total: measuredLineTotal(m) })).concat(unmeasured.map((u:any)=> ({ description:u.description, width:0, height:0, units:u.units, totalSft:0, rate:u.rate, total: u.units*u.rate })));
      const vaishQuote: VaishnaviQuote = {
        customerName: String(q.customer_name || ""),
        quotationNo: String(q.quote_no || ""),
        date: (()=>{ const d=q.date? new Date(q.date): new Date(); const dd=String(d.getDate()).padStart(2,"0"); const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]; return `${dd}-${mn}-${d.getFullYear()}`; })(),
        items: vaishItems as any,
        subtotal: Number(totals.subtotal) + Number(totals.transport),
        gstPercentage: q.include_gst ? Number(q.gst_percentage||0) : 0,
        grandTotal: Number(totals.grandTotal),
        amountInWords,
      };
      const [p1, p2] = await Promise.all([readFile(join(TEMPLATES,"page1.svg"),"utf8"), readFile(join(TEMPLATES,"page2.svg"),"utf8")]);
      const injected1 = injectVaishnaviSvg(p1, vaishQuote);
      const injected2 = p2;
      const pngs = [injected1, injected2].map(svg=> new Resvg(svg,{ fitTo:{mode:"width",value:1240}, font:{fontFiles:FONTS,loadSystemFonts:false,defaultFontFamily:"Arimo"}}).render().asPng());
      const pdfVaish = await PDFDocument.create();
      for(const png of pngs){ const img=await pdfVaish.embedPng(png); const page=pdfVaish.addPage([595.28,841.89]); page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()}); }
      const validMeasured = measured.filter((m:any)=> m.width>0 && m.height>0);
      if(validMeasured.length>0){
        const { rgb } = await import("pdf-lib");
        const { hexToRgb } = await import("@/lib/brand");
        const frameColor = rgb(...hexToRgb("#0B1E3B"));
        for(let i=0;i<validMeasured.length;i+=2){
          const page = pdfVaish.addPage([595.28,841.89]);
          const chunk = validMeasured.slice(i,i+2);
          chunk.forEach((item:any, idx:number)=>{
            const yBase = 700 - idx*350;
            const wMm=item.width, hMm=item.height;
            const fx=100, fy=yBase-220, fw=180, fh=220;
            page.drawRectangle({x:fx,y:fy,width:fw,height:fh, borderColor:frameColor, borderWidth:2, color: rgb(...hexToRgb("#E8F0FF"))});
            page.drawRectangle({x:fx+5,y:fy+5,width:fw-10,height:fh-10, borderColor:frameColor, borderWidth:1});
            page.drawText(`Item ${i+idx+1}: ${String(item.description).slice(0,28)}`,{x:fx,y:fy+fh+12,size:9, color:frameColor});
            page.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}  Rate:Rs ${item.rate}`,{x:fx,y:fy-14,size:7, color:frameColor});
            page.drawLine({start:{x:fx,y:fy-6},end:{x:fx+fw,y:fy-6},thickness:0.8, color:frameColor});
            page.drawLine({start:{x:fx+fw+6,y:fy},end:{x:fx+fw+6,y:fy+fh},thickness:0.8, color:frameColor});
          });
          page.drawText(`VAISHNAVI — CAD Elevations ${i+1}-${Math.min(i+2,validMeasured.length)} of ${validMeasured.length}`,{x:30,y:30,size:7, color:frameColor});
        }
      }
      const bytesVaish = await pdfVaish.save();
      const filenameVaish = `Quotation_${safeFilename(String(q.quote_no || id))}.pdf`;
      return new NextResponse(Buffer.from(bytesVaish), { status:200, headers:{ "Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filenameVaish}"`,"Cache-Control":"private, no-store, max-age=0"}});
    }

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
      clientId: String(q.client_id || ""),
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
      logoUrl: String(config.invoiceTopLogoUrl || config.logoUrl || ""),
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
