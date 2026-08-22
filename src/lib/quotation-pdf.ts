import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "pdf-lib";
import { hexToRgb } from "./brand";
import { quotationTotals, measuredLineSqft, sqft, measuredLineTotal, unmeasuredLineTotal } from "./pricing";
import type { QuotationTotals } from "./pricing";

// Server-side uPVC QUOTATION PDF.
//
// Port of lib/pdf_generator.dart (304 lines). The Flutter app keeps its own
// client-side copy; this is the console/server copy so the desktop console can
// generate the customer-facing PDF without a round trip to the phone.
//
// CURRENCY GOTCHA: pdf-lib's StandardFonts are WinAnsi-encoded and will throw
// "WinAnsi cannot encode U+20B9" on the rupee glyph. We therefore print "Rs."
// exactly like the Flutter PDFs already do (NumberFormat symbol: 'Rs. ').
//
// LAYOUT NOTE: Flutter uses PdfGoogleFonts.robotoRegular() whose metrics differ
// from StandardFonts.Helvetica. We port the LAYOUT MATH, not the pixel values —
// column widths are re-measured for Helvetica.

const C = {
  headerBand: rgb(...hexToRgb("#C44A10")),
  tableHead: rgb(...hexToRgb("#FFF3E6")),
  totalsBg: rgb(...hexToRgb("#FFFBF6")),
  ink: rgb(...hexToRgb("#1A0A00")),
  muted: rgb(...hexToRgb("#7A5030")),
  line: rgb(...hexToRgb("#E2D3C4")),
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
};

const A4: [number, number] = [595.28, 841.89];
const M = 30; // page margin (matches Flutter's EdgeInsets.all(30))

export interface QuotationPdfMeasured {
  code: string;
  description: string;
  glass: string;
  width: number;
  height: number;
  units: number;
  rate: number;
}

export interface QuotationPdfUnmeasured {
  description: string;
  units: number;
  rate: number;
}

export interface QuotationPdfData {
  quoteNo: string;
  date: Date | string;
  customerName: string;
  contactNo: string;
  email: string;
  address: string;
  reference: string;
  supplierCompany: string;
  measured: QuotationPdfMeasured[];
  unmeasured: QuotationPdfUnmeasured[];
  totals: QuotationTotals;
  clientId?: string;
  // Branding.
  companyName: string;
  companyAddress: string;
  companyProprietor: string;
  companyContact: string;
  gstNumber: string;
  // Footer blocks.
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankIfsc: string;
  termsAndConditions: string[];
  // Optional logo URL. Downloaded at request time; skipped if it fails.
  logoUrl?: string;
  watermarkUrl?: string;
}

/** 07-Aug-2026 — matches Flutter DateFormat('dd-MMM-yyyy'). */
function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/** Indian digit grouping: 1234567.5 -> "12,34,567.50" */
function inr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const [whole, frac] = Math.abs(v).toFixed(2).split(".");
  let out: string;
  if (whole.length <= 3) {
    out = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return `Rs. ${out}.${frac}`;
}

/** Rupees in words — matches lib/models.dart:77-99 (hyphenated tens, UPPERCASE). */
function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const two = (x: number): string => {
    if (x < 20) return ones[x];
    return tens[Math.floor(x / 10)] + (x % 10 !== 0 ? "-" + ones[x % 10] : "");
  };
  const three = (x: number): string => {
    if (x >= 100) return ones[Math.floor(x / 100)] + " Hundred" + (x % 100 !== 0 ? " " + two(x % 100) : "");
    return two(x);
  };

  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "RUPEES ZERO ONLY";

  const parts: string[] = [];
  let rem = rupees;
  if (rem >= 10000000) { parts.push(`${three(Math.floor(rem / 10000000))} Crore`); rem %= 10000000; }
  if (rem >= 100000) { parts.push(`${three(Math.floor(rem / 100000))} Lakh`); rem %= 100000; }
  if (rem >= 1000) { parts.push(`${three(Math.floor(rem / 1000))} Thousand`); rem %= 1000; }
  if (rem > 0) parts.push(three(rem));

  let s = parts.join(" ") + " Rupees";
  if (paise > 0) s += ` and ${two(paise)} Paise`;
  return (s + " Only").toUpperCase();
}

/** Strip characters the WinAnsi standard fonts cannot encode. */
function safe(s: unknown): string {
  return String(s ?? "")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

/** Greedy word wrap constrained to a pixel width. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0];
  for (const w of words.slice(1)) {
    const test = `${line} ${w}`;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Download a branding image.
 *
 * NEVER swallow the failure silently. A `catch { /* ignore *\/ }` here cost
 * Venkateshwara the logo AND the watermark on every single PDF for an unknown
 * length of time, with no error, no alert and no support ticket — the customer
 * simply received an unbranded document. A degraded document that looks
 * deliberate is worse than a loud failure, because nobody ever investigates it.
 */
async function loadImageBytes(url: string, role: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[quotation-pdf] ${role} fetch failed HTTP ${res.status}: ${url}`);
      return null;
    }
    const raw = new Uint8Array(await res.arrayBuffer());
    return await downscaleIfOversized(raw, role);
  } catch (e: any) {
    console.error(`[quotation-pdf] ${role} fetch threw: ${String(e?.message ?? e)} url=${url}`);
    return null;
  }
}

/** Longest edge we ever need. The logo draws at ~100x60 pt; the watermark at
 *  ~300 pt wide. 512 px is already 4x oversampled for 300 dpi print. */
const MAX_IMAGE_EDGE = 512;

/**
 * Downscale a branding image before it reaches pdf-lib.
 *
 * WHY (09-08-2026): `kprupvc.png` was a 4,665,338-byte 2048x2048 PNG drawn at
 * ~100x60 pt. Decoding it dominated the whole request: 3,926 ms per PDF and a
 * 4.41 MB output, vs 5 ms / 0.09 MB with a right-sized asset — 785x slower.
 * See troubleshooting/pdf-logo-bloat-2026-08-09.md.
 *
 * The offending asset has since been re-uploaded at 512x512 (44 KB) with
 * `scripts/resize_client_logo.mjs`, but that fixes ONE file. This is the
 * standing guard: any tenant can point `config.logoUrl` at any URL — including
 * an external CDN we do not control — so the server must refuse to embed a
 * multi-megapixel image no matter where it came from.
 *
 * Deliberate choices:
 *  - `sharp` is imported lazily so a missing/incompatible native binary can
 *    never break module load for the routes that never touch images.
 *  - Any failure returns the ORIGINAL bytes. A slow, fat PDF is a performance
 *    bug; a PDF with no logo is a customer-facing branding failure. Degrade to
 *    the former, and log loudly either way.
 *  - PNG stays PNG. The watermark is drawn at 8% opacity over the page, so an
 *    alpha-less JPEG re-encode would paint a solid box across the document.
 */
async function downscaleIfOversized(bytes: Uint8Array, role: string): Promise<Uint8Array> {
  try {
    const sharpMod = (await import("sharp")).default;
    const meta = await sharpMod(bytes).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) return bytes;
    if (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE) return bytes;

    const isJpeg = meta.format === "jpeg";
    const pipeline = sharpMod(bytes).resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
    const out = isJpeg
      ? await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : await pipeline.png({ palette: true, compressionLevel: 9 }).toBuffer();

    console.warn(
      `[quotation-pdf] ${role} was oversized (${w}x${h}, ${bytes.length} bytes) — ` +
        `downscaled to ${MAX_IMAGE_EDGE}px / ${out.length} bytes on the fly. ` +
        `Re-upload it properly: node scripts/resize_client_logo.mjs <file> --apply`,
    );
    return new Uint8Array(out);
  } catch (e: any) {
    console.error(
      `[quotation-pdf] ${role} downscale skipped: ${String(e?.message ?? e)} — embedding original bytes`,
    );
    return bytes;
  }
}

/**
 * Embed a PNG **or** a JPEG, chosen by MAGIC BYTES rather than by the file
 * extension or the Content-Type header.
 *
 * WHY (found 09-08-2026): `venkateshwara.png` is not a PNG. Its first bytes are
 * `ff d8 ff` — it is a JPEG that was uploaded with a `.png` name and is served
 * with `Content-Type: image/png`. The old code only ever called `embedPng()`,
 * which threw "The input is not a PNG file!", and the throw was swallowed. So
 * the filename lies, the Content-Type lies, and the only trustworthy source of
 * truth is the first three bytes of the payload itself.
 */
async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array,
  role: string,
): Promise<Awaited<ReturnType<typeof doc.embedPng>> | null> {
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  try {
    if (isPng) return await doc.embedPng(bytes);
    if (isJpg) return await doc.embedJpg(bytes);
    console.error(
      `[quotation-pdf] ${role} is neither PNG nor JPEG ` +
        `(first bytes: ${Array.from(bytes.slice(0, 4)).map((b) => b.toString(16)).join(" ")})`,
    );
    return null;
  } catch (e: any) {
    console.error(`[quotation-pdf] ${role} embed failed: ${String(e?.message ?? e)}`);
    return null;
  }
}

export async function buildQuotationPdf(data: QuotationPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Quotation ${data.quoteNo || "draft"} - ${data.companyName}`);
  doc.setAuthor(data.companyName);
  doc.setCreator("Vitharn ERP Services");
  doc.setSubject("Quotation");

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ---- Watermark + header logo ----
  //
  // PERF (fixed 09-08-2026): the watermark and the header logo are usually the
  // SAME image. The old code downloaded it once but then called `embedPng()`
  // TWICE on those identical bytes, so pdf-lib decoded the image twice and wrote
  // TWO copies of it into the output — doubling both the CPU cost and the file
  // size for no visual difference whatsoever.
  //
  // Now: fetch each distinct URL once, embed each distinct payload once, and
  // reuse the single embedded object for both draws. pdf-lib is happy to
  // reference one XObject from multiple places.
  // See troubleshooting/pdf-logo-bloat-2026-08-09.md.
  const logoUrl = (data.logoUrl || "").trim();
  const watermarkUrl = (data.watermarkUrl || "").trim();
  // Flutter uses the same image for both when only one is set.
  const effectiveWatermarkUrl = watermarkUrl || logoUrl;
  const sameImage = !!logoUrl && effectiveWatermarkUrl === logoUrl;

  let logoImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  let watermarkImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;

  if (logoUrl) {
    const bytes = await loadImageBytes(logoUrl, "logo");
    if (bytes) logoImg = await embedImage(doc, bytes, "logo");
  }

  if (sameImage) {
    // One download, one decode, one embedded object, two draws.
    watermarkImg = logoImg;
  } else if (effectiveWatermarkUrl) {
    const bytes = await loadImageBytes(effectiveWatermarkUrl, "watermark");
    if (bytes) watermarkImg = await embedImage(doc, bytes, "watermark");
  }

  let page: PDFPage = doc.addPage(A4);
  const W = A4[0];
  const H = A4[1];
  const contentW = W - M * 2;
  let y = H;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: any; align?: "left" | "center" } = {},
  ) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? reg;
    const str = safe(s);
    if (opts.align === "center") {
      page.drawText(str, { x: x - font.widthOfTextAtSize(str, size) / 2, y: yy, size, font, color: opts.color ?? C.ink });
    } else {
      page.drawText(str, { x, y: yy, size, font, color: opts.color ?? C.ink });
    }
  };

  const rightText = (
    s: string,
    rightX: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: any } = {},
  ) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? reg;
    const str = safe(s);
    page.drawText(str, { x: rightX - font.widthOfTextAtSize(str, size), y: yy, size, font, color: opts.color ?? C.ink });
  };

  // ---- Watermark (full-page, opacity 0.06) ----
  if (watermarkImg) {
    const iw = watermarkImg.width;
    const ih = watermarkImg.height;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    page.drawImage(watermarkImg, {
      x: (W - dw) / 2,
      y: (H - dh) / 2,
      width: dw,
      height: dh,
      opacity: 0.06,
    });
  }

  // ---- Header: logo + company band ----
  if (logoImg) {
    const lh = 40;
    const lw = (logoImg.width / logoImg.height) * lh;
    page.drawImage(logoImg, { x: (W - lw) / 2, y: y - lh - 10, width: lw, height: lh });
    y -= lh + 16;
  } else {
    y -= 10;
  }

  const bandH = 56;
  page.drawRectangle({ x: 0, y: y - bandH, width: W, height: bandH, color: C.headerBand });
  text(data.companyName, W / 2, y - 16, { size: 16, font: bold, color: C.white, align: "center" });
  text(data.companyAddress, W / 2, y - 28, { size: 10, color: C.white, align: "center" });
  const propLine = `Prop: ${data.companyProprietor}   Contact: ${data.companyContact}`;
  text(propLine, W / 2, y - 38, { size: 10, color: C.white, align: "center" });
  text(`GST No: ${data.gstNumber}`, W / 2, y - 48, { size: 10, color: C.white, align: "center" });
  y -= bandH + 10;

  // ---- Top bar: quotation no + date ----
  text(`Quotation No: ${data.quoteNo || "—"}`, M, y - 12, { size: 10, font: bold });
  rightText(`Date: ${fmtDate(data.date)}`, W - M, y - 12, { size: 10, font: bold });
  y -= 22;

  // ---- Helper: section title band ----
  const sectionTitle = (label: string) => {
    if (y < 120) { page = doc.addPage(A4); y = H; }
    page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.headerBand });
    text(label, M + 6, y - 12.5, { size: 11, font: bold, color: C.white });
    y -= 22;
  };

  // ---- Customer Details ----
  sectionTitle("Customer Details");
  const detailCell = (label: string, value: string, x: number, w: number) => {
    page.drawRectangle({ x, y: y - 18, width: w, height: 18, borderColor: C.line, borderWidth: 0.5 });
    text(label, x + 4, y - 12.5, { size: 8, font: bold });
    text(value, x + 4 + reg.widthOfTextAtSize(label, 8) + 6, y - 12.5, { size: 9 });
  };
  const colW = contentW / 4;
  detailCell("Name", data.customerName, M, colW);
  detailCell("Reference", data.reference, M + colW, colW);
  detailCell("Address", data.address, M + colW * 2, colW);
  detailCell("Contact No", data.contactNo, M + colW * 3, colW);
  y -= 20;
  if (data.supplierCompany) {
    detailCell("Supplier Company", data.supplierCompany, M, colW * 2);
    y -= 20;
  }

  // ---- Measured items ----
  sectionTitle("Quotation Details");
  if (data.measured.length) {
    const kprSimplified = data.clientId === "kprupvc";
    const headers = kprSimplified
      ? ["S.No", "Description", "W", "H", "Units", "Glass", "SFT", "Rate", "Total"]
      : ["S.No", "Code", "Description", "W", "H", "Units", "Glass", "SFT", "T.SFT", "Rate", "Total"];
    const weights = kprSimplified
      ? [1, 6, 1.2, 1.2, 1.5, 2, 1.5, 2, 2.5]
      : [1, 1.5, 6, 1.2, 1.2, 1.5, 2, 1.5, 1.5, 2, 2.5];
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalW) * contentW);
    const drawRow = (cells: string[], yy: number, opts: { bold?: boolean; bg?: any; size?: number } = {}) => {
      let x = M;
      if (opts.bg) page.drawRectangle({ x, y: yy - 16, width: contentW, height: 16, color: opts.bg });
      for (let i = 0; i < cells.length; i++) {
        const cw = colWidths[i];
        const font = opts.bold ? bold : reg;
        const size = opts.size ?? 8;
        // Right-align numeric columns (index >= 2 for KPR, >= 3 otherwise).
        const numericFrom = kprSimplified ? 2 : 3;
        if (i >= numericFrom) {
          page.drawText(safe(cells[i]), { x: x + cw - 4 - font.widthOfTextAtSize(safe(cells[i]), size), y: yy - 11, size, font });
        } else {
          page.drawText(safe(cells[i]), { x: x + 4, y: yy - 11, size, font });
        }
        x += cw;
      }
      return yy - 16;
    };
    // Header row.
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: C.tableHead });
    let hx = M;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(safe(headers[i]), { x: hx + 4, y: y - 11, size: 8, font: bold });
      hx += colWidths[i];
    }
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
    y -= 16;
    // Data rows.
    for (let idx = 0; idx < data.measured.length; idx++) {
      const m = data.measured[idx];
      if (y < 100) { page = doc.addPage(A4); y = H; }
      // Dart parity: sft = (w/304.8)*(h/304.8); totalSft = sft*units; total = totalSft*rate.
      // Column 7 "SFT" must show per-unit sqft — using measuredLineSqft() here would
      // double-multiply by units and make it identical to column 8 "T.SFT".
      const unitSqft = sqft(m.width, m.height);
      const totalSqft = measuredLineSqft({ width: m.width, height: m.height, units: m.units });
      const lineTotal = measuredLineTotal({ width: m.width, height: m.height, units: m.units, rate: m.rate });
      let cells: string[];
      if (kprSimplified) {
        cells = [
          String(idx + 1),
          m.description,
          String(Math.round(m.width)),
          String(Math.round(m.height)),
          String(m.units),
          m.glass,
          unitSqft.toFixed(2),
          inr(m.rate),
          inr(lineTotal),
        ];
      } else {
        cells = [
          String(idx + 1),
          m.code,
          m.description,
          String(Math.round(m.width)),
          String(Math.round(m.height)),
          String(m.units),
          m.glass,
          unitSqft.toFixed(2),
          totalSqft.toFixed(2),
          inr(m.rate),
          inr(lineTotal),
        ];
      }
      y = drawRow(cells, y);
      page.drawRectangle({ x: M, y: y, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
    }
    y -= 6;
  }

  // ---- Unmeasured items ----
  if (data.unmeasured.length) {
    sectionTitle("Add Items without Measurements (Only Quantity)");
    const headers = ["S.No", "Description", "Units", "Rate Per Unit", "Total"];
    const weights = [1, 6, 1.5, 2.5, 2.5];
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalW) * contentW);
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: C.tableHead });
    let hx = M;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(safe(headers[i]), { x: hx + 4, y: y - 11, size: 8, font: bold });
      hx += colWidths[i];
    }
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
    y -= 16;
    for (let idx = 0; idx < data.unmeasured.length; idx++) {
      const u = data.unmeasured[idx];
      if (y < 100) { page = doc.addPage(A4); y = H; }
      const cells = [String(idx + 1), u.description, String(u.units), inr(u.rate), inr(unmeasuredLineTotal({ units: u.units, rate: u.rate }))];
      let x = M;
      for (let i = 0; i < cells.length; i++) {
        const cw = colWidths[i];
        if (i >= 2) {
          page.drawText(safe(cells[i]), { x: x + cw - 4 - reg.widthOfTextAtSize(safe(cells[i]), 8), y: y - 11, size: 8 });
        } else {
          page.drawText(safe(cells[i]), { x: x + 4, y: y - 11, size: 8 });
        }
        x += cw;
      }
      page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
      y -= 16;
    }
    y -= 6;
  }

  // ---- Totals table (full-width, matches Flutter _buildTotalsTable) ----
  if (y < 140) { page = doc.addPage(A4); y = H; }
  // Row 1: Total SFT + value | Subtotal + value
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  text("Total SFT", M + 6, y - 12.5, { size: 10, font: bold });
  text(data.totals.totalSqft.toFixed(2), M + contentW / 2 + 6, y - 12.5, { size: 10 });
  rightText("Subtotal", M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
  rightText(inr(data.totals.subtotal), M + contentW - 6, y - 12.5, { size: 10 });
  y -= 18;
  // Row 2: Transport + value | IGST + value (if applicable)
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  text("Transport", M + 6, y - 12.5, { size: 10, font: bold });
  text(inr(data.totals.transport), M + contentW / 2 + 6, y - 12.5, { size: 10 });
  if (data.totals.gstPercentage > 0) {
    rightText(`IGST @ ${data.totals.gstPercentage}%`, M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
    rightText(inr(data.totals.gstAmount), M + contentW - 6, y - 12.5, { size: 10 });
  }
  y -= 18;
  // Row 3: empty | empty | Grand Total + value
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  rightText("Grand Total", M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
  rightText(inr(data.totals.grandTotal), M + contentW - 6, y - 12.5, { size: 10, font: bold });
  y -= 18;
  // Row 4: Amount in Words (with accent top border, full width)
  page.drawRectangle({ x: M, y: y - 22, width: contentW, height: 22, color: C.totalsBg });
  page.drawLine({ start: { x: M, y: y }, end: { x: M + contentW, y: y }, thickness: 2, color: C.headerBand });
  text("Amount in Words", M + 6, y - 10, { size: 9, font: bold });
  text(amountInWords(data.totals.grandTotal), M + 6, y - 18, { size: 8 });
  y -= 26;

  // ---- Bank Details + Terms ----
  sectionTitle("Bank Details");
  const halfW = contentW / 2 - 4;
  const bankLines = [
    `Company Name : ${data.companyName}`,
    `Bank Name & Branch : ${data.bankName} - ${data.bankBranch}`,
    data.bankAccountNo,
    data.bankIfsc,
  ];
  let by = y;
  for (const ln of bankLines) {
    text(ln, M, by - 10, { size: 8 });
    by -= 11;
  }
  // Terms on the right.
  let ty = y;
  text("Terms & Conditions", M + halfW + 12, ty - 10, { size: 9, font: bold });
  ty -= 13;
  for (const t of data.termsAndConditions.slice(0, 8)) {
    for (const ln of wrap(t, reg, 7.5, halfW - 8)) {
      text(ln, M + halfW + 12, ty - 9, { size: 7.5 });
      ty -= 10;
    }
  }
  y = Math.min(by, ty) - 20;

  // ---- Signatures ----
  if (y < 100) { page = doc.addPage(A4); y = H; }
  text("Authorised Signature", M, y - 10, { size: 10, font: bold });
  rightText("Customer Signature", W - M, y - 10, { size: 10, font: bold });

  // ---- Footer on every page ----
  const now = new Date();
  const ts = `${fmtDate(now)} ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.5, color: C.line });
    p.drawText(safe(`Generated on ${ts} | This is a computer-generated quotation`), {
      x: M, y: 40, size: 7, font: reg, color: C.muted,
    });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, {
      x: W - M - reg.widthOfTextAtSize(pn, 7), y: 40, size: 7, font: reg, color: C.muted,
    });
  });

  return doc.save();
}
