import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { BRAND, RUST, GST_NOTE, hexToRgb } from "./brand";
import * as QRCode from "qrcode";

// Server-side Vitharn INVOICE PDF (rust/orange monochrome).
//
// Mirrors the look of the Flutter quotation PDF (lib/pdf_generator.dart) but is
// generated entirely in Node so the Flutter app needs NO changes.
//
// CURRENCY GOTCHA: pdf-lib's StandardFonts are WinAnsi-encoded and will throw
// "WinAnsi cannot encode U+20B9" on the rupee glyph. We therefore print "Rs."
// exactly like the Flutter PDFs already do (NumberFormat symbol: 'Rs. ').

const C = {
  main: rgb(...hexToRgb(RUST.mainHex)),
  dark: rgb(...hexToRgb(RUST.darkHex)),
  mid: rgb(...hexToRgb(RUST.midHex)),
  light: rgb(...hexToRgb(RUST.lightHex)),
  paper: rgb(...hexToRgb(RUST.paperHex)),
  ink: rgb(...hexToRgb(RUST.inkHex)),
  muted: rgb(...hexToRgb(RUST.mutedHex)),
  line: rgb(...hexToRgb(RUST.lineHex)),
  white: rgb(1, 1, 1),
};

export type InvoiceLine = {
  description: string;
  details?: string;
  qty?: number;
  amount: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate?: Date | string | null;
  paymentTerms?: string;
  clientName: string;
  clientCompany?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: InvoiceLine[];
  notes?: string;
  /** Overrides for the UPI block; defaults come from env. */
  upiId?: string;
  upiName?: string;
  /** Marks the document PAID (suppresses the due-date emphasis). */
  paid?: boolean;
};

const A4: [number, number] = [595.28, 841.89];
const M = 46; // page margin

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** 07-Aug-2026 — matches the Flutter PDFs' DateFormat('dd-MMM-yyyy'). */
export function fmtDate(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/** Indian digit grouping: 1234567.5 -> "12,34,567.50" */
export function inr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const neg = v < 0;
  const [whole, frac] = Math.abs(v).toFixed(2).split(".");
  let out: string;
  if (whole.length <= 3) {
    out = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return `${neg ? "-" : ""}Rs. ${out}.${frac}`;
}

/** Rupees in words — required by Indian invoicing convention. */
export function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const two = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`;
  const three = (x: number): string =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x);

  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (rest) parts.push(three(rest));

  let s = parts.join(" ") + " Rupees";
  if (paise) s += ` and ${two(paise)} Paise`;
  return s + " Only";
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

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${data.invoiceNumber} - Vitharn ERP Services`);
  doc.setAuthor("Vitharn ERP Services");
  doc.setCreator("Vitharn ERP Services");
  doc.setSubject("Invoice");

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page: PDFPage = doc.addPage(A4);
  const W = A4[0];
  const H = A4[1];
  const contentW = W - M * 2;
  let y = H;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: any } = {},
  ) => {
    page.drawText(safe(s), {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.font ?? reg,
      color: opts.color ?? C.ink,
    });
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
    text(str, rightX - font.widthOfTextAtSize(str, size), yy, opts);
  };

  // ---- Header band ---------------------------------------------------------
  const headerH = 96;
  page.drawRectangle({ x: 0, y: H - headerH, width: W, height: headerH, color: C.main });

  text(BRAND.name, M, H - 40, { size: 21, font: bold, color: C.white });
  text(BRAND.tagline, M, H - 57, { size: 8.5, color: C.light });
  text(BRAND.email + (BRAND.phone ? `  |  ${BRAND.phone}` : ""), M, H - 71, {
    size: 8.5,
    color: C.light,
  });
  text(BRAND.site, M, H - 84, { size: 8.5, color: C.light });

  rightText("INVOICE", W - M, H - 44, { size: 26, font: bold, color: C.white });
  rightText(data.paid ? "PAID" : "PAYMENT DUE", W - M, H - 62, {
    size: 9,
    font: bold,
    color: C.light,
  });

  y = H - headerH - 26;

  // ---- Meta strip ----------------------------------------------------------
  const metaH = 64;
  const colW = contentW / 2;
  page.drawRectangle({
    x: M,
    y: y - metaH,
    width: contentW,
    height: metaH,
    color: C.paper,
    borderColor: C.light,
    borderWidth: 1,
  });

  // BILL TO
  let by = y - 15;
  text("BILL TO", M + 12, by, { size: 7.5, font: bold, color: C.main });
  by -= 13;
  text(data.clientCompany || data.clientName, M + 12, by, { size: 10, font: bold, color: C.dark });
  by -= 11;
  if (data.clientCompany && data.clientName) {
    text(`Attn: ${data.clientName}`, M + 12, by, { size: 8, color: C.ink });
    by -= 10;
  }
  if (data.clientAddress) {
    for (const ln of wrap(data.clientAddress, reg, 8, colW - 30).slice(0, 2)) {
      text(ln, M + 12, by, { size: 8, color: C.muted });
      by -= 9.5;
    }
  }
  const contact = [data.clientEmail, data.clientPhone].filter(Boolean).join("  |  ");
  if (contact) text(contact, M + 12, by, { size: 8, color: C.muted });

  // INVOICE INFO
  const infoX = M + colW + 12;
  const infoRight = W - M - 12;
  let iy = y - 15;
  text("INVOICE DETAILS", infoX, iy, { size: 7.5, font: bold, color: C.main });
  iy -= 13;

  const metaRows: Array<[string, string]> = [
    ["Invoice No", data.invoiceNumber],
    ["Invoice Date", fmtDate(data.invoiceDate)],
    ["Due Date", fmtDate(data.dueDate)],
    ["Payment Terms", data.paymentTerms || "Due on receipt"],
  ];
  for (const [k, v] of metaRows) {
    text(k, infoX, iy, { size: 8, color: C.muted });
    rightText(v, infoRight, iy, { size: 8, font: bold, color: C.dark });
    iy -= 11;
  }

  y -= metaH + 24;

  // ---- Line items table ----------------------------------------------------
  const cols = {
    sno: M + 8,
    desc: M + 38,
    qty: M + contentW - 132,
    amount: M + contentW - 10,
  };
  const descW = cols.qty - cols.desc - 22;

  const drawTableHeader = () => {
    page.drawRectangle({ x: M, y: y - 20, width: contentW, height: 20, color: C.main });
    text("#", cols.sno, y - 13.5, { size: 8, font: bold, color: C.white });
    text("DESCRIPTION", cols.desc, y - 13.5, { size: 8, font: bold, color: C.white });
    rightText("QTY", cols.qty + 24, y - 13.5, { size: 8, font: bold, color: C.white });
    rightText("AMOUNT", cols.amount, y - 13.5, { size: 8, font: bold, color: C.white });
    y -= 20;
  };
  drawTableHeader();

  const items = data.items?.length ? data.items : [];
  let subtotal = 0;

  items.forEach((item, idx) => {
    const descLines = wrap(item.description || "-", bold, 9, descW);
    const detailLines = item.details ? wrap(item.details, reg, 7.8, descW) : [];
    const rowH = Math.max(24, 12 + descLines.length * 11 + detailLines.length * 9.5);

    // Page break — keep the footer band clear.
    if (y - rowH < 190) {
      page = doc.addPage(A4);
      y = H - M;
      drawTableHeader();
    }

    if (idx % 2 === 1) {
      page.drawRectangle({ x: M, y: y - rowH, width: contentW, height: rowH, color: C.paper });
    }
    page.drawLine({
      start: { x: M, y: y - rowH },
      end: { x: M + contentW, y: y - rowH },
      thickness: 0.5,
      color: C.line,
    });

    let ly = y - 14;
    text(String(idx + 1).padStart(2, "0"), cols.sno, ly, { size: 8.5, font: bold, color: C.mid });
    for (const ln of descLines) {
      text(ln, cols.desc, ly, { size: 9, font: bold, color: C.dark });
      ly -= 11;
    }
    for (const ln of detailLines) {
      text(ln, cols.desc, ly, { size: 7.8, color: C.muted });
      ly -= 9.5;
    }

    const qty = item.qty ?? 1;
    rightText(String(qty), cols.qty + 24, y - 14, { size: 8.5, color: C.ink });
    rightText(inr(item.amount), cols.amount, y - 14, { size: 9, font: bold, color: C.dark });

    subtotal += Number(item.amount) || 0;
    y -= rowH;
  });

  if (!items.length) {
    text("No line items.", cols.desc, y - 14, { size: 9, color: C.muted });
    y -= 24;
  }

  // ---- Totals --------------------------------------------------------------
  y -= 14;
  const totalsX = M + contentW - 250;
  const totalsRight = M + contentW - 10;

  const totalRow = (label: string, value: string, opts: { strong?: boolean } = {}) => {
    text(label, totalsX, y, {
      size: opts.strong ? 10 : 9,
      font: opts.strong ? bold : reg,
      color: opts.strong ? C.dark : C.muted,
    });
    rightText(value, totalsRight, y, {
      size: opts.strong ? 10 : 9,
      font: bold,
      color: opts.strong ? C.dark : C.ink,
    });
    y -= 15;
  };

  totalRow("Amount", inr(subtotal));
  totalRow("GST", "NIL");

  // Emphasised grand total
  y -= 3;
  page.drawRectangle({
    x: totalsX - 12,
    y: y - 6,
    width: totalsRight - totalsX + 22,
    height: 26,
    color: C.main,
  });
  text("TOTAL DUE", totalsX, y + 2, { size: 10.5, font: bold, color: C.white });
  rightText(inr(subtotal), totalsRight, y + 2, { size: 11.5, font: bold, color: C.white });
  y -= 26;

  // GST statutory note
  y -= 6;
  for (const ln of wrap(GST_NOTE, oblique, 7.8, contentW)) {
    rightText(ln, totalsRight, y, { size: 7.8, font: oblique, color: C.muted });
    y -= 10;
  }

  // Amount in words
  y -= 6;
  text("Amount in Words: ", M, y, { size: 8.5, font: bold, color: C.dark });
  const wordsX = M + bold.widthOfTextAtSize("Amount in Words: ", 8.5);
  for (const [i, ln] of wrap(amountInWords(subtotal), reg, 8.5, contentW - (wordsX - M)).entries()) {
    text(ln, i === 0 ? wordsX : M, y, { size: 8.5, color: C.ink });
    y -= 11;
  }

  // ---- Payment instructions ------------------------------------------------
  y -= 16;
  if (y < 170) {
    page = doc.addPage(A4);
    y = H - M;
  }

  const payH = 84;
  page.drawRectangle({
    x: M,
    y: y - payH,
    width: contentW,
    height: payH,
    color: C.paper,
    borderColor: C.mid,
    borderWidth: 1,
  });
  page.drawRectangle({ x: M, y: y - payH, width: 3.5, height: payH, color: C.main });

  let py = y - 16;
  text("PAYMENT INSTRUCTIONS", M + 14, py, { size: 8, font: bold, color: C.main });
  py -= 15;

  const upiId = (data.upiId || process.env.VITHARN_UPI_ID || "").trim();
  const upiName = (data.upiName || process.env.VITHARN_UPI_NAME || "Vitharn ERP Services").trim();

  text("UPI ID", M + 14, py, { size: 8, color: C.muted });
  text(upiId || "(UPI ID not configured)", M + 84, py, {
    size: 10,
    font: bold,
    color: upiId ? C.dark : C.muted,
  });
  py -= 13;
  text("Payee Name", M + 14, py, { size: 8, color: C.muted });
  text(upiName, M + 84, py, { size: 8.5, color: C.ink });
  py -= 13;
  text("Reference", M + 14, py, { size: 8, color: C.muted });
  text(data.invoiceNumber, M + 84, py, { size: 8.5, font: bold, color: C.ink });
  py -= 14;
  text(
    "Please quote the invoice number in the UPI remarks so we can match your payment.",
    M + 14,
    py,
    { size: 7.6, font: oblique, color: C.muted },
  );

  if (upiId) {
    try {
      let upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&tr=${encodeURIComponent(data.invoiceNumber)}&cu=INR`;
      if (subtotal > 0) {
        upiUri += `&am=${subtotal.toFixed(2)}`;
      }
      const qrBuffer = await QRCode.toBuffer(upiUri, { errorCorrectionLevel: "M", margin: 0 });
      const qrImg = await doc.embedPng(qrBuffer);
      page.drawImage(qrImg, {
        x: M + contentW - 74,
        y: y - payH + 12,
        width: 60,
        height: 60,
      });
      text("SCAN TO PAY", M + contentW - 68, y - payH + 5, { size: 6.5, font: bold, color: C.main });
    } catch (e) {
      console.error("[invoice-pdf] Failed to generate UPI QR:", e);
    }
  }

  y -= payH + 14;

  if (data.notes) {
    for (const ln of wrap(data.notes, reg, 8, contentW).slice(0, 3)) {
      text(ln, M, y, { size: 8, color: C.muted });
      y -= 10;
    }
  }

  // ---- Footer on every page ------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: 62 },
      end: { x: W - M, y: 62 },
      thickness: 1,
      color: C.main,
    });
    p.drawText(safe("Vitharn ERP Services  |  " + BRAND.email), {
      x: M,
      y: 48,
      size: 8.5,
      font: bold,
      color: C.dark,
    });
    p.drawText(
      safe("This is a computer-generated invoice and is valid without a signature."),
      { x: M, y: 37, size: 7.2, font: oblique, color: C.muted },
    );
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, {
      x: W - M - reg.widthOfTextAtSize(pn, 8),
      y: 48,
      size: 8,
      font: reg,
      color: C.muted,
    });
  });

  return doc.save();
}
