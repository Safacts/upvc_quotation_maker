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
  headerBand: rgb(...hexToRgb("#1e3a5f")),
  tableHead: rgb(...hexToRgb("#dce6f1")),
  totalsBg: rgb(...hexToRgb("#f1f5fa")),
  ink: rgb(...hexToRgb("#1F2937")),
  muted: rgb(...hexToRgb("#6B7280")),
  line: rgb(...hexToRgb("#9CA3AF")),
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

async function loadPng(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
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

  // Watermark + header logo.
  let watermarkPng: Uint8Array | null = null;
  let logoPng: Uint8Array | null = null;
  if (data.watermarkUrl) watermarkPng = await loadPng(data.watermarkUrl);
  if (data.logoUrl) logoPng = await loadPng(data.logoUrl);
  // Flutter uses the same image for both when only one is set.
  if (!watermarkPng && data.logoUrl) watermarkPng = logoPng;

  let watermarkImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  let logoImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  if (watermarkPng) try { watermarkImg = await doc.embedPng(watermarkPng); } catch { /* ignore */ }
  if (logoPng) try { logoImg = await doc.embedPng(logoPng); } catch { /* ignore */ }

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
    const scale = Math.min(W / iw, H / ih);
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
  text(data.companyName, W / 2, y - 16, { size: 14, font: bold, color: C.white, align: "center" });
  text(data.companyAddress, W / 2, y - 28, { size: 8, color: C.white, align: "center" });
  const propLine = `Prop: ${data.companyProprietor}   Contact: ${data.companyContact}`;
  text(propLine, W / 2, y - 38, { size: 8, color: C.white, align: "center" });
  text(`GST No: ${data.gstNumber}`, W / 2, y - 48, { size: 8, color: C.white, align: "center" });
  y -= bandH + 10;

  // ---- Top bar: quotation no + date ----
  text(`Quotation No: ${data.quoteNo || "—"}`, M, y - 12, { size: 10, font: bold });
  rightText(`Date: ${fmtDate(data.date)}`, W - M, y - 12, { size: 10, font: bold });
  y -= 22;

  // ---- Helper: section title band ----
  const sectionTitle = (label: string) => {
    if (y < 120) { page = doc.addPage(A4); y = H; }
    page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.headerBand });
    text(label, M + 6, y - 12.5, { size: 10, font: bold, color: C.white });
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
    const headers = ["S.No", "Code", "Description", "W", "H", "Units", "Glass", "SFT", "T.SFT", "Rate", "Total"];
    // Column weights matching Flutter's FlexColumnWidth ratios.
    const weights = [1, 1.5, 6, 1.2, 1.2, 1.5, 2, 1.5, 1.5, 2, 2.5];
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalW) * contentW);
    const drawRow = (cells: string[], yy: number, opts: { bold?: boolean; bg?: any; size?: number } = {}) => {
      let x = M;
      if (opts.bg) page.drawRectangle({ x, y: yy - 16, width: contentW, height: 16, color: opts.bg });
      for (let i = 0; i < cells.length; i++) {
        const cw = colWidths[i];
        const font = opts.bold ? bold : reg;
        const size = opts.size ?? 8;
        // Right-align numeric columns (index >= 3).
        if (i >= 3) {
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
      const cells = [
        String(idx + 1),
        m.code,
        m.description,
        String(m.width),
        String(m.height),
        String(m.units),
        m.glass,
        unitSqft.toFixed(2),
        totalSqft.toFixed(2),
        inr(m.rate),
        inr(lineTotal),
      ];
      y = drawRow(cells, y);
      page.drawRectangle({ x: M, y, width: contentW, height: 0.5, color: C.line });
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

  // ---- Totals table ----
  if (y < 140) { page = doc.addPage(A4); y = H; }
  const totalsX = M + contentW / 2;
  const totalsW = contentW / 2;
  const drawTotalRow = (left: string, right: string, opts: { bold?: boolean; bg?: any } = {}) => {
    if (opts.bg) page.drawRectangle({ x: totalsX, y: y - 18, width: totalsW, height: 18, color: opts.bg });
    text(left, totalsX + 6, y - 12.5, { size: 9, font: opts.bold ? bold : reg });
    rightText(right, M + contentW - 6, y - 12.5, { size: 9, font: opts.bold ? bold : reg });
    page.drawRectangle({ x: totalsX, y: y - 18, width: totalsW, height: 18, borderColor: C.line, borderWidth: 0.5 });
    y -= 18;
  };
  page.drawRectangle({ x: totalsX, y: y - 18 * 4, width: totalsW, height: 18 * 4, color: C.totalsBg });
  drawTotalRow("Total SFT", data.totals.totalSqft.toFixed(2), { bold: true });
  drawTotalRow("Subtotal", inr(data.totals.subtotal), { bold: true });
  drawTotalRow("Transport", inr(data.totals.transport), { bold: true });
  if (data.totals.gstPercentage > 0) {
    drawTotalRow(`IGST @ ${data.totals.gstPercentage}%`, inr(data.totals.gstAmount), { bold: true });
  }
  // Grand total row with accent border.
  page.drawRectangle({ x: totalsX, y: y - 20, width: totalsW, height: 20, color: C.totalsBg });
  page.drawLine({ start: { x: totalsX, y: y }, end: { x: M + contentW, y: y }, thickness: 2, color: C.headerBand });
  text("Grand Total", totalsX + 6, y - 13.5, { size: 10, font: bold });
  rightText(inr(data.totals.grandTotal), M + contentW - 6, y - 13.5, { size: 10, font: bold });
  y -= 22;
  // Amount in words.
  page.drawRectangle({ x: totalsX, y: y - 22, width: totalsW, height: 22, color: C.totalsBg });
  text("Amount in Words", totalsX + 6, y - 10, { size: 9, font: bold });
  text(amountInWords(data.totals.grandTotal), totalsX + 6, y - 18, { size: 8 });
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
