import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet } from "@/lib/supabase";
import { measuredLineSqft, measuredLineTotal, quotationTotals } from "@/lib/pricing";
import { buildQuotationPdf, type QuotationPdfData } from "@/lib/quotation-pdf";
import type { ClientConfig } from "@/lib/types";
import { Resvg } from "@resvg/resvg-js";
import { injectVaishnaviSvg, type VaishnaviQuote } from "@/lib/vaishnavi-svg-inject";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/quotations/[id]/pdf — generate the uPVC quotation PDF.
 *
 * Returns the customer-facing PDF as a binary download. The document is
 * generated server-side from the SAME `src/lib/pricing.ts` the editor and the
 * Flutter app use, so the numbers match the on-screen preview exactly.
 *
 * Ownership is enforced by the `[id]` GET route we delegate the fetch to — we
 * read the row by primary key AND client_id, so a cross-tenant id returns 404
 * (never a 403 that would confirm the id exists for someone else).
 */

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const rows = await supaGet("quotations", {
      id: "eq." + id,
      client_id: "eq." + gate.clientId,
      select:
        "id,quote_no,date,customer_name,contact_no,email,address,reference," +
        "supplier_company,transport_cost,include_gst,gst_percentage,status," +
        "measured_items(id,code,description,glass,width,height,units,rate)," +
        "unmeasured_items(id,description,units,rate)",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const q = rows[0];

    // Tenant branding for the header / footer blocks.
    const clientId = gate.clientId;
    const clients = await supaGet("clients", {
      id: "eq." + clientId,
      select: "config",
      limit: 1,
    });
    const config: ClientConfig = (Array.isArray(clients) && clients[0]?.config)
      ? (typeof clients[0].config === "string"
        ? JSON.parse(clients[0].config)
        : clients[0].config)
      : { clientId } as any;

    const measured = (q.measured_items || []).map((m: any) => ({
      code: String(m.code || ""),
      description: String(m.description || ""),
      glass: String(m.glass || ""),
      width: num(m.width),
      height: num(m.height),
      units: num(m.units, 1),
      rate: num(m.rate),
    }));
    const unmeasured = (q.unmeasured_items || []).map((u: any) => ({
      description: String(u.description || ""),
      units: num(u.units, 1),
      rate: num(u.rate),
    }));

    const totals = quotationTotals(q, measured, unmeasured);

    // Vaishnavi follows Flutter's purple OASIS estimate (Resvg SVG) + CAD, not generic orange
    const normalizedVaishnavi = String(clientId).toLowerCase().replace(/[^a-z0-9]/g, "");
    const isVaishnavi = normalizedVaishnavi === "vaishnavi" || normalizedVaishnavi === "vaishnaviupvcwindowsanddoors" || normalizedVaishnavi.includes("vaishnavi");
    if (isVaishnavi) {
      // Build Vaishnavi SVG estimate then append CAD elevations like generic
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
        date: (()=>{ const d=q.date? new Date(q.date): new Date(); const dd=String(d.getDate()).padStart(2,"0"); const m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]; return `${dd}-${m}-${d.getFullYear()}`; })(),
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
      const pdf = await PDFDocument.create();
      for(const png of pngs){ const img=await pdf.embedPng(png); const page=pdf.addPage([595.28,841.89]); page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()}); }
      // Append CAD elevations for Vaishnavi like generic (2 per page) — now includes CAD images
      const validMeasured = measured.filter((m:any)=> m.width>0 && m.height>0);
      if(validMeasured.length>0){
        const { rgb } = await import("pdf-lib");
        const { hexToRgb } = await import("@/lib/brand");
        const frameColor = rgb(...hexToRgb("#0B1E3B"));
        const glassColor = rgb(...hexToRgb("#E8F0FF"));
        for(let i=0;i<validMeasured.length;i+=2){
          const page = pdf.addPage([595.28,841.89]);
          const chunk = validMeasured.slice(i,i+2);
          chunk.forEach((item:any, idx:number)=>{
            const yBase = 700 - idx*350;
            const wMm=item.width, hMm=item.height;
            // outer frame 180x220 at x 100
            const fx=100, fy=yBase-220, fw=180, fh=220;
            page.drawRectangle({x:fx,y:fy,width:fw,height:fh, borderColor:frameColor, borderWidth:2, color:glassColor});
            // inner glass
            page.drawRectangle({x:fx+5,y:fy+5,width:fw-10,height:fh-10, borderColor:frameColor, borderWidth:1});
            // labels
            page.drawText(`Item ${i+idx+1}: ${String(item.description).slice(0,28)}`,{x:fx,y:fy+fh+12,size:9, color:frameColor});
            page.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}  Rate:Rs ${item.rate}`,{x:fx,y:fy-14,size:7, color:frameColor});
            // dimension lines
            page.drawLine({start:{x:fx,y:fy-6},end:{x:fx+fw,y:fy-6},thickness:0.8, color:frameColor});
            page.drawLine({start:{x:fx+fw+6,y:fy},end:{x:fx+fw+6,y:fy+fh},thickness:0.8, color:frameColor});
          });
          page.drawText(`Vaishnavi — CAD Window Elevations ${i+1}-${Math.min(i+2,validMeasured.length)} of ${validMeasured.length}`,{x:30,y:30,size:7, color:frameColor});
        }
      }
      const bytesVaish = await pdf.save();
      const filenameVaish = `quotation_${q.quote_no || id}.pdf`;
      return new NextResponse(Buffer.from(bytesVaish), { status:200, headers:{ "Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filenameVaish}"`,"Cache-Control":"private, no-store, max-age=0"}});
    }

    const pdfData: QuotationPdfData = {
      quoteNo: String(q.quote_no || ""),
      date: q.date || q.created_at || new Date(),
      customerName: String(q.customer_name || ""),
      contactNo: String(q.contact_no || ""),
      email: String(q.email || ""),
      address: String(q.address || ""),
      reference: String(q.reference || ""),
      supplierCompany: String(q.supplier_company || ""),
      measured,
      unmeasured,
      totals,
      clientId: String(clientId || ""),
      companyName: String(config.companyName || config.appName || clientId),
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

    const filename = `quotation_${q.quote_no || id}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
