import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { injectVaishnaviSvg, VaishnaviQuote } from "@/lib/vaishnavi-svg-inject";
import { hexToRgb } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clientIds = new Set(["vaishnavi", "vaishnaviupvcwindowsanddoors"]);
const TEMPLATES = join(process.cwd(), "src", "templates", "vaishnavi");
const FONTS = [
  join(TEMPLATES, "fonts", "Arimo.ttf"),
  join(TEMPLATES, "fonts", "Tinos-Regular.ttf"),
  join(TEMPLATES, "fonts", "Tinos-Bold.ttf"),
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = String(body?.client_id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clientIds.has(clientId)) {
      return NextResponse.json({ error: "This renderer is Vaishnavi-only." }, { status: 403 });
    }
    const quote = body?.quote;
    if (!quote || !Array.isArray(quote.items)) {
      return NextResponse.json({ error: "Invalid Vaishnavi quotation payload." }, { status: 400 });
    }

    // 1. Bake the quotation into the client's own SVG reference format.
    const [page1Template, page2Template] = await Promise.all([
      readFile(join(TEMPLATES, "page1.svg"), "utf8"),
      readFile(join(TEMPLATES, "page2.svg"), "utf8"),
    ]);
    const injected1 = injectVaishnaviSvg(page1Template, quote as VaishnaviQuote);
    // Page two carries no live data; render the template as-is.
    const injected2 = page2Template;

    // 2. Rasterize both pages (resvg is a self-contained native binary — no
    // headless Chrome, so this works inside Vercel serverless functions).
    const pngs = [injected1, injected2].map(
      (svg) =>
        new Resvg(svg, {
          fitTo: { mode: "width", value: 1240 }, // ~150dpi on A4
          font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Arimo" },
        }).render().asPng(),
    );

    // 3. Assemble the A4 PDF (2-page Vaishnavi estimate — must stay exactly as designed).
    const pdf = await PDFDocument.create();
    for (const png of pngs) {
      const image = await pdf.embedPng(png);
      const page = pdf.addPage([595.28, 841.89]); // A4 in points
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }

    // 4. Append CAD Window Elevations — Vaishnavi was missing this entirely (generic PDFs already had it).
    // Keep her purple OASIS estimate intact (steps 1-3 above); CAD is extra pages 3+ (2 elevations per A4).
    const validMeasured = (quote.items || []).filter((it: any) => Number(it.width) > 0 && Number(it.height) > 0);
    if (validMeasured.length > 0) {
      const frameColor = rgb(...hexToRgb("#0B1E3B"));
      const glassColor = rgb(...hexToRgb("#E8F0FF"));
      const dimColor = rgb(0, 0, 0);
      const A4_W = 595.28; const A4_H = 841.89; const M = 30; const contentW = A4_W - M * 2;
      const fmtInt = (n: number) => String(Math.round(Number(n) || 0));
      for (let i = 0; i < validMeasured.length; i += 2) {
        const page = pdf.addPage([A4_W, A4_H]);
        const chunk = validMeasured.slice(i, i + 2);
        // Page header like console/public PDFs
        page.drawText(`VAISHNAVI — CAD Window Elevations ${i + 1}-${Math.min(i + 2, validMeasured.length)} of ${validMeasured.length}`, { x: 30, y: A4_H - 30, size: 7, color: frameColor });
        page.drawText(`Customer: ${String((quote as any).customerName || "").slice(0, 40)}  •  Estimate: ${String((quote as any).quotationNo || "")}`, { x: 30, y: A4_H - 42, size: 6, color: rgb(...hexToRgb("#475569")) });
        chunk.forEach((item: any, idx: number) => {
          const yBase = 700 - idx * 350;
          const wMm = Number(item.width) || 0; const hMm = Number(item.height) || 0;
          const fx = 100, fy = yBase - 220, fw = 180, fh = 220;
          const desc = String(item.description || "").toLowerCase();
          // Typology hint for subtitle
          let typeTitle = "Window"; if (desc.includes("sliding")) typeTitle = desc.includes("3 track") ? "3-Track Sliding" : "2-Track Sliding"; else if (desc.includes("door")) typeTitle = "Door"; else if (desc.includes("casement")) typeTitle = "Casement"; else if (desc.includes("ventilator") || desc.includes("vent")) typeTitle = "Ventilator";
          // scaled drawing area (preserve aspect)
          const maxDrawW = contentW - 70; const maxDrawH = 220 - 40; const aspect = wMm / Math.max(hMm, 1);
          let drawW = fw - 10, drawH = fh - 10; if (aspect >= maxDrawW / maxDrawH) { drawW = maxDrawW; drawH = maxDrawW / aspect; } else { drawH = maxDrawH; drawW = maxDrawH * aspect; }
          drawW = Math.max(40, drawW); drawH = Math.max(60, drawH);
          const originX = fx + (fw - drawW) / 2; const originY = fy + (fh - drawH) / 2 + 5;
          // Elevation frame + glass sheen
          page.drawRectangle({ x: fx, y: fy, width: fw, height: fh, borderColor: frameColor, borderWidth: 2, color: glassColor });
          page.drawRectangle({ x: fx + 5, y: fy + 5, width: fw - 10, height: fh - 10, borderColor: frameColor, borderWidth: 1 });
          // inner glass highlight (like generic quotation-pdf.ts)
          if (drawW > 20 && drawH > 20) {
            page.drawRectangle({ x: originX, y: originY, width: drawW, height: drawH, color: frameColor, borderColor: frameColor, borderWidth: 1.5 });
            const gw = drawW - 8, gh = drawH - 8; if (gw > 4 && gh > 4) page.drawRectangle({ x: originX + 4, y: originY + 4, width: gw, height: gh, color: glassColor, borderColor: rgb(...hexToRgb("#93A4C8")), borderWidth: 1 });
            // typology mullion hint (sliding)
            if (typeTitle.includes("Sliding")) {
              const midX = originX + drawW / 2; const splits = typeTitle.includes("3-Track") ? 2 : 1;
              for (let s = 1; s <= splits; s++) { const x = originX + (drawW / (splits + 1)) * s; page.drawLine({ start: { x, y: originY }, end: { x, y: originY + drawH }, thickness: 1.2, color: rgb(...hexToRgb("#475569")) }); }
            }
          }
          page.drawText(`Item ${i + idx + 1}: ${String(item.description).slice(0, 28)} — ${typeTitle}`, { x: fx, y: fy + fh + 12, size: 8, color: frameColor });
          page.drawText(`${Math.round(wMm)} x ${Math.round(hMm)} mm  Qty:${item.units}  Rate:Rs ${item.rate}`, { x: fx, y: fy - 14, size: 7, color: frameColor });
          page.drawLine({ start: { x: fx, y: fy - 6 }, end: { x: fx + fw, y: fy - 6 }, thickness: 0.8, color: frameColor });
          page.drawLine({ start: { x: fx + fw + 6, y: fy }, end: { x: fx + fw + 6, y: fy + fh }, thickness: 0.8, color: frameColor });
        });
      }
    }

    const bytes = await pdf.save();

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=vaishnavi-estimate.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Vaishnavi SVG PDF render failed", error);
    return NextResponse.json({ error: "Vaishnavi PDF rendering failed." }, { status: 500 });
  }
}
