import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import { injectVaishnaviSvg, VaishnaviQuote } from "@/lib/vaishnavi-svg-inject";
import { hexToRgb } from "@/lib/brand";
import { drawWindowElevationCard } from "@/lib/quotation-pdf";

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

    // 4. Append CAD — identical engine to KPR/generic (drawWindowElevationCard), after purple SVG. Include 0×0 items with fallback so Vaishnavi never loses CAD pages like before.
    const cadItems = (quote.items || []).filter((it: any) => String(it.description || "").trim() !== "");
    if (cadItems.length > 0) {
      const reg = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const A4_W = 595.28; const A4_H = 841.89; const M = 30; const contentW = A4_W - M * 2;
      const itemsPerPage = 2; const cardH = 355;
      for (let i = 0; i < cadItems.length; i += itemsPerPage) {
        const page = pdf.addPage([A4_W, A4_H]);
        const headerColor = rgb(...hexToRgb("#0B1E3B"));
        page.drawText(`VAISHNAVI — CAD Window Elevations ${i + 1}-${Math.min(i + 2, cadItems.length)} of ${cadItems.length}`, { x: 30, y: A4_H - 30, size: 7, color: headerColor });
        page.drawText(`Customer: ${String((quote as any).customerName || "").slice(0, 40)}  •  Estimate: ${String((quote as any).quotationNo || "")}`, { x: 30, y: A4_H - 42, size: 6, color: rgb(...hexToRgb("#475569")) });
        const chunk = cadItems.slice(i, i + itemsPerPage);
        chunk.forEach((raw: any, idx: number) => {
          const globalIdx = i + idx + 1;
          const cardTopY = A4_H - M - 10 - idx * (cardH + 10);
          const rawW = Number(raw.width) || 0; const rawH = Number(raw.height) || 0;
          const w = rawW > 0 ? rawW : 1000; const h = rawH > 0 ? rawH : 1200;
          const isExtreme = rawW > 6000 || rawH > 6000 || rawW < 200 || rawH < 200 || rawW===0 || rawH===0;
          let cw = w, ch = h; if (cw / Math.max(ch, 1) < 0.3) cw = ch * 0.3; if (cw / Math.max(ch, 1) > 3) cw = ch * 3;
          if (isExtreme) page.drawText(`⚠ Check dimensions — not to scale`, { x: M, y: cardTopY - 14, size: 6, color: rgb(0.85, 0.2, 0.2) });
          drawWindowElevationCard(page, { code: String(raw.code || ""), description: String(raw.description || ""), glass: String(raw.glass || ""), width: cw, height: ch, units: Number(raw.units) || 1, rate: Number(raw.rate) || 0 }, globalIdx, M, cardTopY, contentW, cardH - 10, { reg, bold });
          if (isExtreme) page.drawText(`Actual: ${Math.round(rawW)}×${Math.round(rawH)} mm`, { x: M + contentW - 90, y: cardTopY - 14, size: 6, color: rgb(0.85, 0.2, 0.2) });
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
