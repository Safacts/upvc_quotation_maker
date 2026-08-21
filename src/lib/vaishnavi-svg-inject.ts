/**
 * Vaishnavi SVG data injection — server-side port of
 * scripts/inject-vaishnavi-svg-data.mjs (kept byte-compatible with the CLI so
 * local renders and production renders stay identical).
 *
 * The client's supplied reference PDF was converted to a two-page SVG; this
 * module finds the original text anchors by coordinates and rewrites them with
 * live quotation data before the SVG is rasterized to PDF.
 */

const escapeXml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[char] as string));

const indian = (value: unknown): string =>
  Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const decimal = (value: unknown): string =>
  Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1);

const splitText = (text: string, limit: number): [string, string] => {
  if (text.length <= limit) return [text, ""];
  const breakPoint = text.lastIndexOf(" ", limit);
  const splitIndex = breakPoint === -1 ? limit : breakPoint;
  const line1 = text.slice(0, splitIndex);
  let line2 = text.slice(splitIndex + 1).trim();
  if (line2.length > limit) line2 = `${line2.slice(0, limit - 3).trim()}...`;
  return [line1, line2];
};

export interface VaishnaviQuote {
  customerName: string;
  quotationNo: string;
  date: string;
  items: Array<{
    description: string;
    width: number;
    height: number;
    units: number;
    totalSft: number;
    rate: number;
    total: number;
  }>;
  subtotal: number;
  gstPercentage: number;
  grandTotal: number;
  amountInWords: string;
}

export function injectVaishnaviSvg(template: string, quote: VaishnaviQuote): string {
  let svg = template;

  function replaceNear(
    targetY: number,
    targetX: number,
    value: unknown,
    toleranceX = 1,
    fitWidth: number | null = null,
    fontFamily = "Arial, sans-serif",
    eraseDistance: number | null = null,
  ): void {
    let replaced = false;
    svg = svg.replace(/<tspan y="([0-9.]+)" x="([^"]+)"([^>]*)>([\s\S]*?)<\/tspan>/g, (whole, y, xs, rest) => {
      const x = Number(xs.trim().split(/\s+/)[0]);
      if (Math.abs(Number(y) - targetY) > 0.01) return whole;
      if (!replaced && Math.abs(x - targetX) <= toleranceX) {
        replaced = true;
        let cleanRest = rest.replace(/\s+dx="[^"]*"/g, "").replace(/\s+dy="[^"]*"/g, "");
        // Never stretch short values to fill a whole cell. Only constrain text
        // when a rough width estimate says it would overflow that cell.
        const estimatedWidth = String(value).length * (fontFamily === "Georgia, serif" ? 8 : 4.5);
        const fit =
          fitWidth && estimatedWidth > fitWidth
            ? ` textLength="${fitWidth}" lengthAdjust="spacingAndGlyphs"`
            : "";
        // The source PDF-to-SVG contains one x coordinate per original glyph.
        // Re-anchor the replacement as a normal text run; textLength then fits
        // that run into the original cell width.
        return `<tspan y="${y}" x="${targetX}" font-family="${fontFamily}"${cleanRest}${fit}>${escapeXml(value)}</tspan>`;
      }
      // Clear stale fragments from the old text on this baseline.
      if (replaced && x > targetX && x < targetX + (eraseDistance ?? fitWidth ?? 50)) {
        return `<tspan y="${y}" x="${xs}"${rest}></tspan>`;
      }
      return whole;
    });
    if (!replaced) throw new Error(`Missing SVG text anchor y=${targetY}, x=${targetX}`);
  }

  replaceNear(181, 13.59375, quote.customerName, 1, 250, "Georgia, serif");
  replaceNear(157, 592.25, quote.quotationNo, 1, 88);
  replaceNear(173, 592.25, quote.date, 1, 88);

  const rows = [
    { y: 264, first: 259, second: 269, qtyX: 426.82814, gstX: 592.9421, amountX: 660.0358, gstRupeeX: 588.3125, amountRupeeX: 655.40628 },
    { y: 307, first: 302, second: 312, qtyX: 424.46876, gstX: 604.7702, amountX: 666.8327, gstRupeeX: 600.1406, amountRupeeX: 662.2031 },
    { y: 350, first: 345, second: 355, qtyX: 431.85939, gstX: 599.73898, amountX: 660.0358, gstRupeeX: 595.1094, amountRupeeX: 655.40628 },
    { y: 393, first: 388, second: 398, qtyX: 431.85939, gstX: 599.73898, amountX: 660.0358, gstRupeeX: 595.1094, amountRupeeX: 655.40628 },
    { y: 436, first: 431, second: 441, qtyX: 431.85939, gstX: 604.7702, amountX: 666.8327, gstRupeeX: 600.1406, amountRupeeX: 662.2031 },
    { y: 479, first: 474, second: 484, qtyX: 436.89064, gstX: 604.7702, amountX: 666.8327, gstRupeeX: 600.1406, amountRupeeX: 662.2031 },
    { y: 522, first: 517, second: 527, qtyX: 431.85939, gstX: 599.73898, amountX: 660.0358, gstRupeeX: 595.1094, amountRupeeX: 655.40628 },
  ];

  rows.forEach((anchor, index) => {
    const item = quote.items[index];
    const description = item ? `${Math.round(item.width)} mm x ${Math.round(item.height)} mm ${item.description}` : "";
    replaceNear(anchor.y, 14.59375, item ? index + 1 : "");
    const [line1, line2] = splitText(description, 36);
    replaceNear(anchor.first, 38.046876, line1, 1, 140);
    replaceNear(anchor.second, 38.046876, line2, 1, 140);
    replaceNear(anchor.y, 185.51563, item?.units ?? "", 1, 28);
    replaceNear(anchor.y, 239.125, item ? Math.round(item.totalSft / Math.max(item.units, 1)) : "", 1, 28);
    replaceNear(anchor.y, 292.73439, item ? "Nylon" : "", 1, 30);
    replaceNear(anchor.y, 346.34376, item ? "Clear" : "", 1, 30);
    replaceNear(anchor.y, anchor.qtyX, item ? decimal(item.totalSft) : "", 0.1, 52);
    replaceNear(anchor.y, 493.75, item ? "Sqf" : "", 1, 25);
    replaceNear(anchor.y, 544.55148, item ? ` ${Number(item.rate).toFixed(2)}` : "", 1, 42);
    replaceNear(anchor.first, anchor.gstX, item ? ` ${indian((item.total * quote.gstPercentage) / 100)}` : "", 0.1, 42);
    replaceNear(anchor.second, 611.1094, item ? `(${Number(quote.gstPercentage).toFixed(1)}%)` : "", 1, 35);
    replaceNear(anchor.y, anchor.amountX, item ? ` ${indian(item.total * (1 + quote.gstPercentage / 100))}` : "", 0.1, 42, "Arial, sans-serif", 100);
    if (!item) {
      replaceNear(anchor.y, 539.9219, "");
      replaceNear(anchor.first, anchor.gstRupeeX, "", 0.1);
      replaceNear(anchor.y, anchor.amountRupeeX, "", 0.1);
      if (index === 6) replaceNear(anchor.second, 43.507066, "", 0.1);
    }
  });

  const totalSft = quote.items.reduce((sum, item) => sum + Number(item.totalSft), 0);
  const totalTax = (Number(quote.subtotal) * Number(quote.gstPercentage)) / 100;
  replaceNear(565, 418.3125, decimal(totalSft));
  replaceNear(565, 590.0289, ` ${indian(totalTax)}`);
  replaceNear(570, 654.15628, indian(quote.grandTotal));
  replaceNear(595, 655.0046, ` ${indian(quote.subtotal)}`);
  replaceNear(612, 660.0358, ` ${indian(totalTax / 2)}`);
  replaceNear(628, 660.0358, ` ${indian(totalTax / 2)}`);
  replaceNear(652, 652.9426, ` ${indian(quote.grandTotal)}`);
  replaceNear(898, 13.59375, quote.amountInWords);

  return svg;
}
