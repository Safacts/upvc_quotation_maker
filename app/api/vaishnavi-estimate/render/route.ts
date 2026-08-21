import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import { injectVaishnaviSvg, VaishnaviQuote } from "@/lib/vaishnavi-svg-inject";

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

    // 3. Assemble the A4 PDF.
    const pdf = await PDFDocument.create();
    for (const png of pngs) {
      const image = await pdf.embedPng(png);
      const page = pdf.addPage([595.28, 841.89]); // A4 in points
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
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
