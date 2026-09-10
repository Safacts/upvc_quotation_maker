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
 * GET /api/console/quotations/[id]/pdf - generate the uPVC quotation PDF.
 *
 * Returns the customer-facing PDF as a binary download. The document is
 * generated server-side from the SAME `src/lib/pricing.ts` the editor and the
 * Flutter app use, so the numbers match the on-screen preview exactly.
 *
 * Ownership is enforced by the `[id]` GET route we delegate the fetch to - we
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
        "supplier_company,transport_cost,include_gst,gst_percentage,advance_paid,status," +
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
      // Append CAD elevations for Vaishnavi - keep her 2-page purple estimate, add 2-per-page scaled elevations (typology-aware)
      const validMeasured = measured.filter((m: any) => m.width > 0 && m.height > 0);
      if (validMeasured.length > 0) {
        const { rgb } = await import("pdf-lib");
        const { hexToRgb } = await import("@/lib/brand");
        const frameColor = rgb(...hexToRgb("#0B1E3B"));
        const glassColor = rgb(...hexToRgb("#E8F0FF"));
        const A4_W = 595.28; const A4_H = 841.89; const M = 30; const contentW = A4_W - M * 2;
        for (let i = 0; i < validMeasured.length; i += 2) {
          const page = pdf.addPage([A4_W, A4_H]);
          const chunk = validMeasured.slice(i, i + 2);
          page.drawText(`VAISHNAVI - CAD Window Elevations ${i + 1}-${Math.min(i + 2, validMeasured.length)} of ${validMeasured.length}`, { x: 30, y: A4_H - 30, size: 7, color: frameColor });
          page.drawText(`Customer: ${String(q.customer_name || "").slice(0, 40)}  •  Estimate: ${String(q.quote_no || "")}`, { x: 30, y: A4_H - 42, size: 6, color: rgb(...hexToRgb("#475569")) });
          chunk.forEach((item: any, idx: number) => {
            const yBase = 700 - idx * 350;
            const wMm = Number(item.width) || 0; const hMm = Number(item.height) || 0;
            const fx = 100, fy = yBase - 220, fw = 180, fh = 220;
            const desc = String(item.description || "").toLowerCase();
            let typeTitle = "Window"; if (desc.includes("3sw") || desc.includes("3 track") || desc.includes("3-track") || desc.includes("3track")) typeTitle = "3-Track Sliding"; else if (desc.includes("2sw") || desc.includes("sliding") || desc.includes("slider") || desc.includes("2 track") || desc.includes("2-track")) typeTitle = "2-Track Sliding"; else if (desc.includes("door")) typeTitle = "Door"; else if (desc.includes("casement")) typeTitle = "Casement"; else if (desc.includes("ventilator") || desc.includes("vent")) typeTitle = "Ventilator";
            page.drawRectangle({ x: fx, y: fy, width: fw, height: fh, borderColor: frameColor, borderWidth: 2, color: glassColor });
            page.drawRectangle({ x: fx + 5, y: fy + 5, width: fw - 10, height: fh - 10, borderColor: frameColor, borderWidth: 1 });
            const isExtreme = wMm > 6000 || hMm > 6000 || wMm < 200 || hMm < 200;
            let drawAspect = wMm / Math.max(hMm, 1); if (drawAspect < 0.3) drawAspect = 0.3; if (drawAspect > 3) drawAspect = 3;
            const maxDrawW = contentW - 70; const maxDrawH = 220 - 40;
            let drawW = fw - 10, drawH = fh - 10; if (drawAspect >= maxDrawW / maxDrawH) { drawW = maxDrawW; drawH = maxDrawW / drawAspect; } else { drawH = maxDrawH; drawW = maxDrawH * drawAspect; }
            drawW = Math.max(40, drawW); drawH = Math.max(60, drawH);
            const originX = fx + (fw - drawW) / 2; const originY = fy + (fh - drawH) / 2 + 5;
            if (drawW > 20 && drawH > 20) {
              page.drawRectangle({ x: originX, y: originY, width: drawW, height: drawH, color: frameColor, borderColor: frameColor, borderWidth: 1.2 });
              const gw = drawW - 8, gh = drawH - 8; if (gw > 4 && gh > 4) page.drawRectangle({ x: originX + 4, y: originY + 4, width: gw, height: gh, color: glassColor, borderColor: rgb(...hexToRgb("#93A4C8")), borderWidth: 1 });
              if (typeTitle.includes("Sliding")) { const midX = originX + drawW / 2; const splits = typeTitle.includes("3-Track") ? 2 : 1; for (let s = 1; s <= splits; s++) { const x = originX + (drawW / (splits + 1)) * s; page.drawLine({ start: { x, y: originY }, end: { x, y: originY + drawH }, thickness: 1.2, color: rgb(...hexToRgb("#475569")) }); } }
            }
            page.drawText(`Item ${i + idx + 1}: ${String(item.description).slice(0, 28)} - ${typeTitle}`, { x: fx, y: fy + fh + 12, size: 8, color: frameColor });
            if (isExtreme) page.drawText(`! Check dimensions - not to scale`, { x: fx, y: fy + fh + 2, size: 6, color: rgb(0.85, 0.2, 0.2) });
            page.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}  Rate:Rs ${item.rate}`, { x: fx, y: fy - 14, size: 7, color: frameColor });
            page.drawLine({ start: { x: fx, y: fy - 6 }, end: { x: fx + fw, y: fy - 6 }, thickness: 0.8, color: frameColor });
            page.drawLine({ start: { x: fx + fw + 6, y: fy }, end: { x: fx + fw + 6, y: fy + fh }, thickness: 0.8, color: frameColor });
          });
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
