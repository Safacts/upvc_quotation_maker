import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
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
  if (rupees >= 1000000000000) return "RUPEES — ONLY"; // 1e12+ would overflow Crore/Lakh logic (1e22 → UNDEFINED)

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

/** Format numbers without scientific notation and avoid cell overflow for absurd inputs (e.g. 1e+21). */
function fmtSft(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1e12) return "—"; // avoid 22-digit overflow — show dash
  const s = Number(n).toFixed(2);
  return s.includes("e") || s.includes("E") ? "—" : s;
}
function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1e9) return "—";
  const s = String(Math.round(n));
  return s.includes("e") || s.includes("E") ? "—" : s;
}
function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "Rs. 0.00";
  if (Math.abs(n) >= 1e12) return "Rs. —";
  return inr(n);
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
    if (y < 130) { page = doc.addPage(A4); y = H - M - 10; }
    page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.headerBand });
    text(label, M + 6, y - 12.5, { size: 11, font: bold, color: C.white });
    y -= 22;
  };

  // ---- Customer Details ----
  sectionTitle("Customer Details");
  const detailCell = (label: string, value: string, x: number, w: number) => {
    page.drawRectangle({ x, y: y - 18, width: w, height: 18, borderColor: C.line, borderWidth: 0.5 });
    text(label, x + 4, y - 12.5, { size: 8, font: bold });
    const labelW = bold.widthOfTextAtSize(label, 8);
    const maxValW = w - labelW - 12;
    let str = safe(value);
    while (reg.widthOfTextAtSize(str, 8.5) > maxValW && str.length > 3) {
      str = str.substring(0, str.length - 2) + ".";
    }
    text(str, x + 4 + labelW + 6, y - 12.5, { size: 8.5 });
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
      ? [1, 4.2, 1.3, 1.3, 1.1, 4.2, 1.3, 2.0, 2.4]
      : [1, 1.5, 4.2, 1.3, 1.3, 1.1, 4.0, 1.3, 1.3, 2.0, 2.4];
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalW) * contentW);
    const drawRow = (cells: string[], yy: number, opts: { bold?: boolean; bg?: any; size?: number } = {}) => {
      let x = M;
      if (opts.bg) page.drawRectangle({ x, y: yy - 16, width: contentW, height: 16, color: opts.bg });
      for (let i = 0; i < cells.length; i++) {
        const cw = colWidths[i];
        const font = opts.bold ? bold : reg;
        const size = opts.size ?? 7.5;
        let str = safe(cells[i]);
        // Clip if text exceeds cell width - 6
        while (font.widthOfTextAtSize(str, size) > cw - 6 && str.length > 3) {
          str = str.substring(0, str.length - 2) + ".";
        }
        // Right-align numeric columns (W, H, Units, SFT, Rate, Total)
        const isNumeric = kprSimplified ? (i === 2 || i === 3 || i === 4 || i === 6 || i === 7 || i === 8) : (i === 3 || i === 4 || i === 5 || i === 7 || i === 8 || i === 9 || i === 10);
        if (isNumeric) {
          page.drawText(str, { x: x + cw - 4 - font.widthOfTextAtSize(str, size), y: yy - 11, size, font });
        } else {
          page.drawText(str, { x: x + 4, y: yy - 11, size, font });
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
      if (y < 100) {
        page = doc.addPage(A4);
        y = H - M - 10;
        page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: C.tableHead });
        let rhx = M;
        for (let i = 0; i < headers.length; i++) {
          page.drawText(safe(headers[i]), { x: rhx + 4, y: y - 11, size: 8, font: bold });
          rhx += colWidths[i];
        }
        page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
        y -= 16;
      }
      // Dart parity: sft = (w/304.8)*(h/304.8); totalSft = sft*units; total = totalSft*rate.
      const unitSqft = sqft(m.width, m.height);
      const totalSqft = measuredLineSqft({ width: m.width, height: m.height, units: m.units });
      const lineTotal = measuredLineTotal({ width: m.width, height: m.height, units: m.units, rate: m.rate });
      let cells: string[];
      if (kprSimplified) {
        cells = [
          String(idx + 1),
          m.description,
          fmtInt(m.width),
          fmtInt(m.height),
          String(m.units),
          m.glass,
          fmtSft(unitSqft),
          fmtMoney(m.rate),
          fmtMoney(lineTotal),
        ];
      } else {
        cells = [
          String(idx + 1),
          m.code,
          m.description,
          fmtInt(m.width),
          fmtInt(m.height),
          String(m.units),
          m.glass,
          fmtSft(unitSqft),
          fmtSft(totalSqft),
          fmtMoney(m.rate),
          fmtMoney(lineTotal),
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
      if (y < 100) {
        page = doc.addPage(A4);
        y = H - M - 10;
        page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: C.tableHead });
        let rhx = M;
        for (let i = 0; i < headers.length; i++) {
          page.drawText(safe(headers[i]), { x: rhx + 4, y: y - 11, size: 8, font: bold });
          rhx += colWidths[i];
        }
        page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
        y -= 16;
      }
      const cells = [String(idx + 1), u.description, String(u.units), fmtMoney(u.rate), fmtMoney(unmeasuredLineTotal({ units: u.units, rate: u.rate }))];
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
  if (y < 150) { page = doc.addPage(A4); y = H - M - 10; }
  // Row 1: Total SFT + value | Subtotal + value
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  text("Total SFT", M + 6, y - 12.5, { size: 10, font: bold });
  text(fmtSft(data.totals.totalSqft), M + contentW / 2 + 6, y - 12.5, { size: 10 });
  rightText("Subtotal", M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
  rightText(fmtMoney(data.totals.subtotal), M + contentW - 6, y - 12.5, { size: 10 });
  y -= 18;
  // Row 2: Transport + value | IGST + value (if applicable)
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  text("Transport", M + 6, y - 12.5, { size: 10, font: bold });
  text(fmtMoney(data.totals.transport), M + contentW / 2 + 6, y - 12.5, { size: 10 });
  if (data.totals.gstPercentage > 0) {
    rightText(`IGST @ ${data.totals.gstPercentage}%`, M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
    rightText(fmtMoney(data.totals.gstAmount), M + contentW - 6, y - 12.5, { size: 10 });
  }
  y -= 18;
  // Row 3: empty | empty | Grand Total + value
  page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
  rightText("Grand Total", M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
  rightText(fmtMoney(data.totals.grandTotal), M + contentW - 6, y - 12.5, { size: 10, font: bold });
  y -= 18;

  // Row 3b: Advance Paid and Remaining Amount (if advance is recorded)
  if (data.totals.advancePaid > 0) {
    page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.totalsBg });
    text("Advance Paid", M + 6, y - 12.5, { size: 10, font: bold });
    text(`- ${fmtMoney(data.totals.advancePaid)}`, M + contentW / 2 + 6, y - 12.5, { size: 10 });
    rightText("Remaining Balance", M + contentW * 3 / 4, y - 12.5, { size: 10, font: bold });
    rightText(fmtMoney(data.totals.balanceDue), M + contentW - 6, y - 12.5, { size: 10, font: bold });
    y -= 18;
  }

  // Row 4: Amount in Words (with accent top border, full width)
  page.drawRectangle({ x: M, y: y - 22, width: contentW, height: 22, color: C.totalsBg });
  page.drawLine({ start: { x: M, y: y }, end: { x: M + contentW, y: y }, thickness: 2, color: C.headerBand });
  text(data.totals.advancePaid > 0 ? "Remaining Amount in Words" : "Amount in Words", M + 6, y - 10, { size: 9, font: bold });
  text(amountInWords(data.totals.advancePaid > 0 ? data.totals.balanceDue : data.totals.grandTotal), M + 6, y - 18, { size: 8 });
  y -= 26;

  // ---- Bank Details + Terms (220 pt look-ahead guard against footer collision) ----
  if (y < 220) { page = doc.addPage(A4); y = H - M - 10; }
  const halfW = (contentW - 12) / 2;
  page.drawRectangle({ x: M, y: y - 18, width: halfW, height: 18, color: C.headerBand });
  text("Bank Details", M + 6, y - 12.5, { size: 10, font: bold, color: C.white });

  page.drawRectangle({ x: M + halfW + 12, y: y - 18, width: halfW, height: 18, color: C.headerBand });
  text("Terms & Conditions", M + halfW + 18, y - 12.5, { size: 10, font: bold, color: C.white });
  y -= 22;

  const bankLines = [
    `Company Name : ${data.companyName}`,
    `Bank Name & Branch : ${data.bankName} - ${data.bankBranch}`,
    `Account No : ${data.bankAccountNo}`,
    `IFSC : ${data.bankIfsc}`,
  ];
  let by = y;
  for (const ln of bankLines) {
    text(ln, M, by - 10, { size: 8 });
    by -= 12;
  }

  let ty = y;
  for (const t of data.termsAndConditions.slice(0, 8)) {
    for (const ln of wrap(t, reg, 7.5, halfW - 4)) {
      text(ln, M + halfW + 12, ty - 10, { size: 7.5 });
      ty -= 11;
    }
  }
  y = Math.min(by, ty) - 16;

  // ---- Signatures ----
  if (y < 110) { page = doc.addPage(A4); y = H - M - 10; }
  text("Authorised Signature", M, y - 12, { size: 10, font: bold });
  rightText("Customer Signature", W - M, y - 12, { size: 10, font: bold });

  // ---- Window Elevation & CAD Measurement Schedule Pages ----
  const validMeasured = (data.measured || []).filter((item) => item.width > 0 && item.height > 0);
  if (validMeasured.length > 0) {
    const itemsPerPage = 2;
    for (let i = 0; i < validMeasured.length; i += itemsPerPage) {
      const elevPage = doc.addPage(A4);
      const chunk = validMeasured.slice(i, i + itemsPerPage);
      const cardHeight = 355; // Plenty of clearance above footer line at y=50

      chunk.forEach((item, chunkIdx) => {
        const globalIdx = i + chunkIdx + 1;
        const cardTopY = H - M - 10 - chunkIdx * (cardHeight + 10);
        drawWindowElevationCard(
          elevPage,
          item,
          globalIdx,
          M,
          cardTopY,
          contentW,
          cardHeight - 10,
          { reg, bold }
        );
      });
    }
  }

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

function drawWindowElevationCard(
  page: PDFPage,
  item: QuotationPdfMeasured,
  itemIndex: number,
  cardX: number,
  cardY: number, // top of the card
  cardW: number,
  cardH: number,
  fonts: { reg: PDFFont; bold: PDFFont }
) {
  const { reg, bold } = fonts;
  const desc = item.description || "";
  const lowerDesc = desc.toLowerCase();

  // Detect typology
  let type = "fixed";
  let typeTitle = `Fixed Window: Item ${itemIndex}`;
  if (lowerDesc.includes("door") || lowerDesc.includes("french")) {
    type = lowerDesc.includes("double") || lowerDesc.includes("2 sash") ? "doubleDoor" : "singleDoor";
    typeTitle = type === "doubleDoor" ? `Double Door: Item ${itemIndex}` : `Single Door: Item ${itemIndex}`;
  } else if (lowerDesc.includes("3 track") || lowerDesc.includes("3-track") || lowerDesc.includes("3track")) {
    type = "sliding3";
    typeTitle = `3-Track Sliding Window: Item ${itemIndex}`;
  } else if (lowerDesc.includes("sliding") || lowerDesc.includes("slider") || lowerDesc.includes("2 track") || lowerDesc.includes("2-track")) {
    type = "sliding2";
    typeTitle = `2-Track Sliding Window: Item ${itemIndex}`;
  } else if (lowerDesc.includes("casement") || lowerDesc.includes("openable") || lowerDesc.includes("side hung")) {
    type = "casement";
    typeTitle = `Casement Window: Item ${itemIndex}`;
  } else if (lowerDesc.includes("ventilator") || lowerDesc.includes("vent") || lowerDesc.includes("louver")) {
    type = "ventilator";
    typeTitle = `Ventilator: Item ${itemIndex}`;
  }

  // Header specs
  let hy = cardY;
  const titleW = bold.widthOfTextAtSize(typeTitle, 12);
  page.drawText(typeTitle, { x: cardX + (cardW - titleW) / 2, y: hy, size: 12, font: bold, color: C.ink });
  hy -= 14;

  const wText = `Width: ${fmtInt(item.width)} mm`;
  const wW = reg.widthOfTextAtSize(wText, 9);
  page.drawText(wText, { x: cardX + (cardW - wW) / 2, y: hy, size: 9, font: reg, color: C.muted });
  hy -= 12;

  const hText = `Height: ${fmtInt(item.height)} mm`;
  const hW = reg.widthOfTextAtSize(hText, 9);
  page.drawText(hText, { x: cardX + (cardW - hW) / 2, y: hy, size: 9, font: reg, color: C.muted });
  hy -= 12;

  if (desc) {
    const descShort = desc.length > 50 ? desc.substring(0, 48) + "..." : desc;
    const dW = reg.widthOfTextAtSize(descShort, 8.5);
    page.drawText(descShort, { x: cardX + (cardW - dW) / 2, y: hy, size: 8.5, font: reg, color: C.muted });
    hy -= 14;
  }

  // Drawing area
  const drawAreaTop = hy - 5;
  const drawAreaBottom = cardY - cardH + 20;
  const maxDrawH = Math.max(80, drawAreaTop - drawAreaBottom - 40); // 40 for bottom dimension line
  const maxDrawW = cardW - 70; // 70 for right dimension line

  const wMm = item.width > 0 ? item.width : 1000;
  const hMm = item.height > 0 ? item.height : 1000;
  const aspect = wMm / hMm;

  let drawW: number;
  let drawH: number;
  if (aspect >= (maxDrawW / maxDrawH)) {
    drawW = maxDrawW;
    drawH = maxDrawW / aspect;
  } else {
    drawH = maxDrawH;
    drawW = maxDrawH * aspect;
  }
  drawW = Math.max(35, drawW);
  drawH = Math.max(50, drawH);

  const originX = cardX + (cardW - drawW - 40) / 2;
  const originY = drawAreaBottom + (maxDrawH - drawH) / 2 + 30;

  const isWhite = lowerDesc.includes("white");
  const frameColor = isWhite ? rgb(0.96, 0.97, 0.98) : rgb(0.18, 0.22, 0.28);
  const frameBorder = isWhite ? rgb(0.5, 0.55, 0.6) : rgb(0.1, 0.12, 0.15);
  const beadBorder = isWhite ? rgb(0.75, 0.8, 0.85) : rgb(0.6, 0.68, 0.75);
  const glassColor = rgb(0.8, 0.89, 0.96);
  const glassSheenColor = rgb(0.92, 0.96, 0.99);

  // Outer Frame
  page.drawRectangle({
    x: originX,
    y: originY,
    width: drawW,
    height: drawH,
    color: frameColor,
    borderColor: frameBorder,
    borderWidth: 2,
  });

  // Glazing bead + glass
  const frameThickness = 5;
  const glassX = originX + frameThickness;
  const glassY = originY + frameThickness;
  const glassW = drawW - frameThickness * 2;
  const glassH = drawH - frameThickness * 2;

  if (glassW > 4 && glassH > 4) {
    page.drawRectangle({
      x: glassX,
      y: glassY,
      width: glassW,
      height: glassH,
      color: glassColor,
      borderColor: beadBorder,
      borderWidth: 1,
    });

    // Glass sheen (corner highlight)
    const sheenW = glassW * 0.45;
    const sheenH = glassH * 0.4;
    page.drawRectangle({
      x: glassX + 1,
      y: glassY + glassH - sheenH - 1,
      width: sheenW,
      height: sheenH,
      color: glassSheenColor,
      opacity: 0.8,
    });

    // Typology overlays
    if (type === "singleDoor") {
      const midY = glassY + glassH * 0.5;
      page.drawText("SWING", { x: glassX + 4, y: midY + 4, size: 7, font: bold, color: rgb(0.9, 0.2, 0.2) });
      page.drawRectangle({ x: glassX, y: glassY, width: glassW, height: Math.min(12, glassH * 0.15), color: rgb(0.9, 0.92, 0.95), borderColor: beadBorder, borderWidth: 0.8 });
    } else if (type === "doubleDoor") {
      const midX = glassX + glassW / 2;
      page.drawLine({ start: { x: midX, y: glassY }, end: { x: midX, y: glassY + glassH }, thickness: 2, color: frameBorder });
    } else if (type === "sliding2") {
      const midX = glassX + glassW / 2;
      page.drawLine({ start: { x: midX, y: glassY }, end: { x: midX, y: glassY + glassH }, thickness: 1.5, color: beadBorder });
      const midY = glassY + glassH * 0.5;
      page.drawLine({ start: { x: glassX + glassW * 0.1, y: midY }, end: { x: glassX + glassW * 0.4, y: midY }, thickness: 1, color: rgb(0.2, 0.4, 0.7) });
      page.drawLine({ start: { x: midX + glassW * 0.1, y: midY }, end: { x: midX + glassW * 0.4, y: midY }, thickness: 1, color: rgb(0.2, 0.4, 0.7) });
    } else if (type === "sliding3") {
      const pW = glassW / 3;
      page.drawLine({ start: { x: glassX + pW, y: glassY }, end: { x: glassX + pW, y: glassY + glassH }, thickness: 1.5, color: beadBorder });
      page.drawLine({ start: { x: glassX + pW * 2, y: glassY }, end: { x: glassX + pW * 2, y: glassY + glassH }, thickness: 1.5, color: beadBorder });
    } else if (type === "casement") {
      page.drawLine({ start: { x: glassX, y: glassY }, end: { x: glassX + glassW, y: glassY + glassH / 2 }, thickness: 0.8, color: rgb(0.4, 0.5, 0.6) });
      page.drawLine({ start: { x: glassX, y: glassY + glassH }, end: { x: glassX + glassW, y: glassY + glassH / 2 }, thickness: 0.8, color: rgb(0.4, 0.5, 0.6) });
    } else if (type === "ventilator") {
      const blades = Math.max(2, Math.floor(hMm / 100));
      const step = glassH / (blades + 1);
      for (let b = 1; b <= blades; b++) {
        const by = glassY + step * b;
        page.drawLine({ start: { x: glassX, y: by }, end: { x: glassX + glassW, y: by }, thickness: 1, color: beadBorder });
      }
    }
  }

  // Dimension lines & Arrows (CAD style)
  const dimColor = rgb(0, 0, 0);
  const bottomExtY = originY - 14;
  const bottomDimY = originY - 10;

  // Horizontal witness lines
  page.drawLine({ start: { x: originX, y: originY - 2 }, end: { x: originX, y: bottomExtY }, thickness: 0.6, color: dimColor });
  page.drawLine({ start: { x: originX + drawW, y: originY - 2 }, end: { x: originX + drawW, y: bottomExtY }, thickness: 0.6, color: dimColor });
  // Horizontal dimension line
  page.drawLine({ start: { x: originX, y: bottomDimY }, end: { x: originX + drawW, y: bottomDimY }, thickness: 0.8, color: dimColor });
  // Horizontal arrows (tick lines)
  page.drawLine({ start: { x: originX, y: bottomDimY }, end: { x: originX + 4, y: bottomDimY + 2 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: originX, y: bottomDimY }, end: { x: originX + 4, y: bottomDimY - 2 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: originX + drawW, y: bottomDimY }, end: { x: originX + drawW - 4, y: bottomDimY + 2 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: originX + drawW, y: bottomDimY }, end: { x: originX + drawW - 4, y: bottomDimY - 2 }, thickness: 0.8, color: dimColor });
  // Width label
  const wDimLabel = `${fmtInt(wMm)} mm`;
  const wDimW = bold.widthOfTextAtSize(wDimLabel, 8.5);
  page.drawText(wDimLabel, { x: originX + (drawW - wDimW) / 2, y: bottomDimY - 9, size: 8.5, font: bold, color: dimColor });

  // Vertical witness lines
  const rightExtX = originX + drawW + 14;
  const rightDimX = originX + drawW + 10;
  page.drawLine({ start: { x: originX + drawW + 2, y: originY }, end: { x: rightExtX, y: originY }, thickness: 0.6, color: dimColor });
  page.drawLine({ start: { x: originX + drawW + 2, y: originY + drawH }, end: { x: rightExtX, y: originY + drawH }, thickness: 0.6, color: dimColor });
  // Vertical dimension line
  page.drawLine({ start: { x: rightDimX, y: originY }, end: { x: rightDimX, y: originY + drawH }, thickness: 0.8, color: dimColor });
  // Vertical arrows
  page.drawLine({ start: { x: rightDimX, y: originY }, end: { x: rightDimX + 2, y: originY + 4 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: rightDimX, y: originY }, end: { x: rightDimX - 2, y: originY + 4 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: rightDimX, y: originY + drawH }, end: { x: rightDimX + 2, y: originY + drawH - 4 }, thickness: 0.8, color: dimColor });
  page.drawLine({ start: { x: rightDimX, y: originY + drawH }, end: { x: rightDimX - 2, y: originY + drawH - 4 }, thickness: 0.8, color: dimColor });
  // Height label (vertical text)
  const hDimLabel = `${fmtInt(hMm)} mm`;
  const hDimW = bold.widthOfTextAtSize(hDimLabel, 8.5);
  page.drawText(hDimLabel, {
    x: rightDimX + 10,
    y: originY + (drawH - hDimW) / 2,
    size: 8.5,
    font: bold,
    color: dimColor,
    rotate: degrees(90),
  });
}
