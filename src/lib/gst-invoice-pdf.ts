import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "pdf-lib";
import { hexToRgb } from "./brand";

// Server-side GST INVOICE PDF.
//
// Port of lib/gst_pdf_generator.dart (283 lines). The Flutter app keeps its own
// client-side copy; this is the console/server copy so the desktop console can
// generate the GST invoice PDF without a round trip to the phone.
//
// CURRENCY GOTCHA: pdf-lib's StandardFonts are WinAnsi-encoded and will throw
// "WinAnsi cannot encode U+20B9" on the rupee glyph. We print "Rs." exactly like
// the Flutter PDFs already do.

const C = {
  headerBand: rgb(...hexToRgb("#1e3a5f")),
  tableHead: rgb(...hexToRgb("#dce6f1")),
  totalsBg: rgb(...hexToRgb("#f1f5fa")),
  ink: rgb(...hexToRgb("#1F2937")),
  muted: rgb(...hexToRgb("#6B7280")),
  line: rgb(...hexToRgb("#9CA3AF")),
  white: rgb(1, 1, 1),
};

const A4: [number, number] = [595.28, 841.89];
const M = 30;

export interface GstInvoicePdfItem {
  sno: number;
  hsnCode: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  taxableValue: number;
}

export interface GstInvoicePdfData {
  invoiceNumber: string;
  invoiceDate: Date | string;
  placeOfSupply: string;
  // Supplier.
  companyName: string;
  companyAddress: string;
  gstNumber: string;
  // Bank details.
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankIfsc: string;
  // Buyer.
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerState: string;
  buyerStateCode: string;
  // Flags.
  isInterstate: boolean;
  isReverseCharge: boolean;
  // Items.
  items: GstInvoicePdfItem[];
  // Money.
  subtotal: number;
  transportCost: number;
  taxableValue: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
  amountInWords: string;
  notes: string;
  termsAndConditions: string[];
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

/** Rupees in words — matches Dart `GstInvoiceData.numberToWords`. Uppercased. */
export function amountInWords(n: number): string {
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

export async function buildGstInvoicePdf(data: GstInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`GST Invoice ${data.invoiceNumber || "draft"} - ${data.companyName}`);
  doc.setAuthor(data.companyName);
  doc.setCreator("Vitharn ERP Services");
  doc.setSubject("GST Invoice");

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

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

  // ---- Header: TAX INVOICE + company band ----
  text("TAX INVOICE", W / 2, y - 24, { size: 18, font: bold, color: C.headerBand, align: "center" });
  y -= 36;

  const bandH = 56;
  page.drawRectangle({ x: 0, y: y - bandH, width: W, height: bandH, color: C.headerBand });
  text(data.companyName, W / 2, y - 16, { size: 14, font: bold, color: C.white, align: "center" });
  text(data.companyAddress, W / 2, y - 28, { size: 8, color: C.white, align: "center" });
  text(`GST No: ${data.gstNumber}`, W / 2, y - 40, { size: 8, color: C.white, align: "center" });
  y -= bandH + 12;

  // ---- Invoice details ----
  text(`Invoice No: ${data.invoiceNumber || "—"}`, M, y - 12, { size: 10, font: bold });
  text(`Date: ${fmtDate(data.invoiceDate)}`, W / 2, y - 12, { size: 10, font: bold, align: "center" });
  rightText(`Place of Supply: ${data.placeOfSupply}`, W - M, y - 12, { size: 10, font: bold });
  y -= 22;

  // ---- Section title helper ----
  const sectionTitle = (label: string) => {
    if (y < 120) { page = doc.addPage(A4); y = H; }
    page.drawRectangle({ x: M, y: y - 18, width: contentW, height: 18, color: C.headerBand });
    text(label, M + 6, y - 12.5, { size: 10, font: bold, color: C.white });
    y -= 22;
  };

  // ---- Supplier / Buyer blocks ----
  if (y < 120) { page = doc.addPage(A4); y = H; }
  const halfW = contentW / 2 - 2;
  const blockH = 60;
  page.drawRectangle({ x: M, y: y - blockH, width: halfW, height: blockH, borderColor: C.line, borderWidth: 0.5 });
  page.drawRectangle({ x: M + halfW + 4, y: y - blockH, width: halfW, height: blockH, borderColor: C.line, borderWidth: 0.5 });
  text("Supplier Details", M + 6, y - 12, { size: 9, font: bold });
  text(data.companyName, M + 6, y - 22, { size: 8, font: bold });
  text(data.companyAddress, M + 6, y - 32, { size: 8 });
  text(`GSTIN: ${data.gstNumber}`, M + 6, y - 42, { size: 8 });
  text("Bill To (Buyer Details)", M + halfW + 10, y - 12, { size: 9, font: bold });
  text(data.buyerName, M + halfW + 10, y - 22, { size: 8, font: bold });
  text(data.buyerAddress, M + halfW + 10, y - 32, { size: 8 });
  text(`GSTIN: ${data.buyerGstin}`, M + halfW + 10, y - 42, { size: 8 });
  text(`State: ${data.buyerState} (${data.buyerStateCode})`, M + halfW + 10, y - 52, { size: 8 });
  y -= blockH + 10;

  // ---- Items table ----
  sectionTitle("Invoice Items");
  const headers = ["S.No", "HSN", "Description", "Qty", "Unit", "Rate", "Taxable Value"];
  const weights = [0.8, 1.2, 4, 1, 1, 2, 2];
  const totalW = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => (w / totalW) * contentW);
  // Header.
  page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: C.tableHead });
  let hx = M;
  for (let i = 0; i < headers.length; i++) {
    page.drawText(safe(headers[i]), { x: hx + 4, y: y - 11, size: 8, font: bold });
    hx += colWidths[i];
  }
  page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
  y -= 16;
  // Data rows.
  for (const item of data.items) {
    if (y < 100) { page = doc.addPage(A4); y = H; }
    const cells = [String(item.sno), item.hsnCode, item.description, String(item.quantity), item.unit, inr(item.rate), inr(item.taxableValue)];
    let x = M;
    for (let i = 0; i < cells.length; i++) {
      const cw = colWidths[i];
      if (i >= 3) {
        page.drawText(safe(cells[i]), { x: x + cw - 4 - reg.widthOfTextAtSize(safe(cells[i]), 8), y: y - 11, size: 8 });
      } else {
        page.drawText(safe(cells[i]), { x: x + 4, y: y - 11, size: 8 });
      }
      x += cw;
    }
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, borderColor: C.line, borderWidth: 0.5 });
    y -= 16;
  }
  y -= 10;

  // ---- Tax summary ----
  if (y < 160) { page = doc.addPage(A4); y = H; }
  const totalsX = M + contentW / 2;
  const totalsW = contentW / 2;
  const drawTotalRow = (left: string, right: string, opts: { bold?: boolean; bg?: any } = {}) => {
    if (opts.bg) page.drawRectangle({ x: totalsX, y: y - 18, width: totalsW, height: 18, color: opts.bg });
    text(left, totalsX + 6, y - 12.5, { size: 9, font: opts.bold ? bold : reg });
    rightText(right, M + contentW - 6, y - 12.5, { size: 9, font: opts.bold ? bold : reg });
    page.drawRectangle({ x: totalsX, y: y - 18, width: totalsW, height: 18, borderColor: C.line, borderWidth: 0.5 });
    y -= 18;
  };
  page.drawRectangle({ x: totalsX, y: y - 18 * 6, width: totalsW, height: 18 * 6, color: C.totalsBg });
  drawTotalRow("Subtotal", inr(data.subtotal), { bold: true });
  drawTotalRow("Transport", inr(data.transportCost), { bold: true });
  drawTotalRow("Taxable Value", inr(data.taxableValue), { bold: true });
  if (data.isInterstate) {
    drawTotalRow(`IGST @ ${data.igstRate}%`, inr(data.igstAmount), { bold: true });
  } else {
    drawTotalRow(`CGST @ ${data.cgstRate}%`, inr(data.cgstAmount), { bold: true });
    drawTotalRow(`SGST @ ${data.sgstRate}%`, inr(data.sgstAmount), { bold: true });
  }
  // Grand total with accent.
  page.drawLine({ start: { x: totalsX, y: y }, end: { x: M + contentW, y: y }, thickness: 2, color: C.headerBand });
  y -= 2;
  drawTotalRow("Grand Total", inr(data.grandTotal), { bold: true });
  y -= 6;

  // ---- Amount in words ----
  if (y < 80) { page = doc.addPage(A4); y = H; }
  page.drawRectangle({ x: M, y: y - 22, width: contentW, height: 22, borderColor: C.line, borderWidth: 0.5 });
  text("Amount in Words: ", M + 6, y - 10, { size: 9, font: bold });
  const wordsStr = data.amountInWords || amountInWords(data.grandTotal);
  text(wordsStr, M + 90, y - 10, { size: 8 });
  y -= 26;

  // ---- Bank Details ----
  sectionTitle("Bank Details");
  const bankLines = [
    `Company Name : ${data.companyName}`,
    `Bank Name & Branch : ${data.bankName} - ${data.bankBranch}`,
    `Account No : ${data.bankAccountNo}`,
    `IFSC : ${data.bankIfsc}`,
  ];
  for (const ln of bankLines) {
    if (y < 120) { page = doc.addPage(A4); y = H; }
    text(ln, M, y - 9, { size: 8 });
    y -= 10;
  }
  y -= 6;

  // ---- Terms & Conditions ----
  sectionTitle("Terms & Conditions");
  for (const t of data.termsAndConditions.slice(0, 6)) {
    for (const ln of wrap(t, reg, 7.5, contentW)) {
      if (y < 80) { page = doc.addPage(A4); y = H; }
      text(ln, M, y - 9, { size: 7.5 });
      y -= 10;
    }
  }
  y -= 6;

  // ---- Reverse charge ----
  if (y < 80) { page = doc.addPage(A4); y = H; }
  text("Reverse Charge: ", M, y - 10, { size: 9, font: bold });
  text(data.isReverseCharge ? "Yes" : "No", M + 80, y - 10, { size: 9 });
  y -= 20;

  // ---- Signature ----
  if (y < 100) { page = doc.addPage(A4); y = H; }
  rightText(`For ${data.companyName}`, W - M, y - 10, { size: 10, font: bold });
  y -= 30;
  rightText("Authorized Signature", W - M, y - 10, { size: 10 });

  // ---- Footer on every page ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.5, color: C.line });
    p.drawText(safe("This is a computer-generated GST invoice"), {
      x: M, y: 40, size: 7, font: reg, color: C.muted,
    });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, {
      x: W - M - reg.widthOfTextAtSize(pn, 7), y: 40, size: 7, font: reg, color: C.muted,
    });
  });

  return doc.save();
}
