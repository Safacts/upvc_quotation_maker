import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "pdf-lib";
import { hexToRgb } from "./brand";
import { measuredLineSqft, sqft, measuredLineTotal, unmeasuredLineTotal } from "./pricing";
import type { QuotationPdfData } from "./quotation-pdf";

const C = {
  primary: rgb(...hexToRgb("#9c88ff")), // Purple from SVG
  tableHead: rgb(...hexToRgb("#192b56")), // Navy table header from SVG
  tableAltRow: rgb(...hexToRgb("#eeeeee")), // Light gray alternating row from SVG
  totalsBg: rgb(...hexToRgb("#192b56")), // Navy totals background
  ink: rgb(...hexToRgb("#000000")),
  muted: rgb(...hexToRgb("#808080")), // Gray from SVG
  line: rgb(...hexToRgb("#9a9a9a")), // Lighter gray line from SVG
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
  navy: rgb(...hexToRgb("#192b56")), // Navy blue from SVG
};

const A4: [number, number] = [595.28, 841.89];
const M = 30; // page margin

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

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
  return `\u20B9 ${out}.${frac}`;
}

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
  if (rupees === 0) return "Zero Rupees only";

  const parts: string[] = [];
  let rem = rupees;
  if (rem >= 10000000) { parts.push(`${three(Math.floor(rem / 10000000))} Crore`); rem %= 10000000; }
  if (rem >= 100000) { parts.push(`${three(Math.floor(rem / 100000))} Lakh`); rem %= 100000; }
  if (rem >= 1000) { parts.push(`${three(Math.floor(rem / 1000))} Thousand`); rem %= 1000; }
  if (rem > 0) parts.push(three(rem));

  let s = parts.join(" ") + " Rupees";
  return s + " only";
}

function safe(s: unknown): string {
  return String(s ?? "")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

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

export async function buildVaishnaviQuotationPdf(data: QuotationPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Estimate ${data.quoteNo || "draft"} - ${data.companyName}`);
  
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
    opts: { size?: number; font?: PDFFont; color?: any; align?: "left" | "center" | "right" } = {},
  ) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? reg;
    const str = safe(s);
    if (opts.align === "center") {
      page.drawText(str, { x: x - font.widthOfTextAtSize(str, size) / 2, y: yy, size, font, color: opts.color ?? C.ink });
    } else if (opts.align === "right") {
      page.drawText(str, { x: x - font.widthOfTextAtSize(str, size), y: yy, size, font, color: opts.color ?? C.ink });
    } else {
      page.drawText(str, { x, y: yy, size, font, color: opts.color ?? C.ink });
    }
  };

  // Header Banner
  page.drawRectangle({ x: M, y: y - 50, width: contentW, height: 50, color: C.primary });
  page.drawRectangle({ x: M, y: y - 100, width: 300, height: 50, color: C.navy });
  
  // Company details on header
  text("Vaishnavi Upvc Windows & Doors", M + 10, y - 65, { size: 14, color: C.white, font: bold });
  text(`GSTIN: ${data.gstNumber || '36CSPPV7053P1ZJ'}`, M + 10, y - 80, { size: 8, color: C.white });
  text("State: 36-Telangana", M + 10, y - 92, { size: 8, color: C.white });
  
  text("9640000825", M + 120, y - 25, { size: 9, color: C.white });
  text("Ecotexupvc@gmail.com", M + 240, y - 25, { size: 9, color: C.white });
  const addr = "SY NO 21 AND 22 Near Kharmanghat\nHanuman Temple Gayatri Nagar X\nRoads Hyderabad";
  let addY = y - 15;
  addr.split('\n').forEach(l => {
    text(l, M + 380, addY, { size: 8, color: C.white });
    addY -= 10;
  });

  y -= 120;

  // Title: Estimate
  text("Estimate", W - M, y, { size: 22, font: bold, align: "right" });
  y -= 30;

  // Estimate For
  text("Estimate For", M, y, { size: 10, color: C.primary });
  y -= 15;
  text(data.customerName, M, y, { size: 14, font: bold });
  
  text(`Estimate No.:`, W - M - 100, y + 15, { size: 10, font: bold });
  text(data.quoteNo, W - M, y + 15, { size: 10, align: "right" });
  text(`Date:`, W - M - 100, y, { size: 10, font: bold });
  text(fmtDate(data.date), W - M, y, { size: 10, align: "right" });

  y -= 30;

  // Table
  const headers = ["#", "Item Name", "Windows\nQTY", "Windows\nSQ FEET", "MESH", "Glass", "Quantity", "Unit", "Price/ Unit", "GST", "Amount"];
  const weights = [0.8, 4, 1.8, 1.8, 1.5, 1.5, 1.5, 1.2, 2, 2.5, 3];
  const totalW = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => (w / totalW) * contentW);

  const drawTableHeader = (yy: number): number => {
    page.drawRectangle({ x: M, y: yy - 30, width: contentW, height: 30, color: C.tableHead });
    let hx = M;
    for (let i = 0; i < headers.length; i++) {
      const lines = headers[i].split('\n');
      let lY = yy - (lines.length > 1 ? 10 : 15);
      lines.forEach(l => {
        text(l, hx + (colWidths[i] / 2), lY, { size: 7.5, font: bold, color: C.white, align: "center" });
        lY -= 9;
      });
      hx += colWidths[i];
    }
    return yy - 30;
  };
  y = drawTableHeader(y);
  y -= 30;

  // Rows
  const drawRow = (cells: string[], yy: number, opts: { bold?: boolean; bg?: any; size?: number; height?: number } = {}) => {
    let x = M;
    const rowH = opts.height || 25;
    if (opts.bg) page.drawRectangle({ x, y: yy - rowH, width: contentW, height: rowH, color: opts.bg });
    for (let i = 0; i < cells.length; i++) {
      const cw = colWidths[i];
      const font = opts.bold ? bold : reg;
      const size = opts.size ?? 8;
      
      const parts = safe(cells[i]).split('\n');
      let textY = yy - (rowH / 2) + ((parts.length - 1) * 5); // vertically center
      
      parts.forEach(p => {
        if (i >= 6 || i === 2 || i === 3) {
          text(p, x + cw - 4, textY - 3, { size, font, align: "right" });
        } else {
          text(p, x + 4, textY - 3, { size, font });
        }
        textY -= 10;
      });
      x += cw;
    }
    // Vertical lines
    let lx = M;
    for (let i = 0; i <= colWidths.length; i++) {
      page.drawLine({ start: { x: lx, y: yy }, end: { x: lx, y: yy - rowH }, color: C.line, thickness: 0.5 });
      if (i < colWidths.length) lx += colWidths[i];
    }
    // Horizontal line
    page.drawLine({ start: { x: M, y: yy - rowH }, end: { x: M + contentW, y: yy - rowH }, color: C.line, thickness: 0.5 });
    return yy - rowH;
  };

  let totalQty = 0;
  for (let idx = 0; idx < data.measured.length; idx++) {
    const m = data.measured[idx];
    const sqftVal = sqft(m.width, m.height);
    const totalSqft = measuredLineSqft({ width: m.width, height: m.height, units: m.units });
    const lineTotal = measuredLineTotal({ width: m.width, height: m.height, units: m.units, rate: m.rate });
    const gstRate = Number.isFinite(data.totals.gstPercentage) ? data.totals.gstPercentage : 0;
    const gstAmt = (lineTotal * gstRate) / 100;
    
    totalQty += totalSqft;

    const rowH = Math.max(30, Math.ceil(reg.widthOfTextAtSize(safe(m.description), 8) / (colWidths[1] - 8)) * 12 + 10);
    
    const cells = [
      String(idx + 1),
      `${m.width} mm x ${m.height} mm \n${m.description}`,
      String(m.units),
      String(sqftVal.toFixed(0)), // Wait, screenshot says 36 for 1828x1828.
      "Nylon", // Hardcoded or extracted from m.description if possible. "Nylon" in screenshot
      m.glass || "Clear",
      totalSqft.toFixed(1),
      "Sqf",
      inr(m.rate),
      gstRate > 0 ? `${inr(gstAmt)}\n(${gstRate}%)` : "-",
      inr(lineTotal + gstAmt),
    ];
    if (y - rowH < 100) { page = doc.addPage(A4); y = drawTableHeader(H - M); }
    y = drawRow(cells, y, { height: rowH, bg: idx % 2 === 1 ? C.tableAltRow : undefined });
  }

  for (let idx = 0; idx < data.unmeasured.length; idx++) {
    const item = data.unmeasured[idx];
    const gstRate = Number.isFinite(data.totals.gstPercentage) ? data.totals.gstPercentage : 0;
    const lineTotal = unmeasuredLineTotal({ units: item.units, rate: item.rate });
    const gstAmt = (lineTotal * gstRate) / 100;
    const rowH = Math.max(25, Math.ceil(reg.widthOfTextAtSize(safe(item.description), 8) / (colWidths[1] - 8)) * 12 + 10);
    const cells = [
      String(data.measured.length + idx + 1), item.description, "-", "-", "-", "-",
      String(item.units), "Nos", inr(item.rate), gstRate > 0 ? `${inr(gstAmt)}\n(${gstRate}%)` : "-",
      inr(lineTotal + gstAmt),
    ];
    if (y - rowH < 100) { page = doc.addPage(A4); y = drawTableHeader(H - M); }
    y = drawRow(cells, y, { height: rowH, bg: (data.measured.length + idx) % 2 === 1 ? C.tableAltRow : undefined });
  }

  // Totals Row
  if (y - 25 < 100) { page = doc.addPage(A4); y = drawTableHeader(H - M); }
  page.drawRectangle({ x: M, y: y - 25, width: contentW, height: 25, color: C.totalsBg });
  text("Total", M + 10, y - 16, { size: 9, font: bold, color: C.white });
  text(totalQty.toFixed(1), M + colWidths.slice(0, 7).reduce((a, b) => a + b, 0) - 4, y - 16, { size: 9, font: bold, color: C.white, align: "right" });
  text(inr(data.totals.gstAmount), M + colWidths.slice(0, 10).reduce((a, b) => a + b, 0) - 4, y - 16, { size: 9, font: bold, color: C.white, align: "right" });
  text(inr(data.totals.grandTotal), M + contentW - 4, y - 16, { size: 9, font: bold, color: C.white, align: "right" });
  
  y -= 25;

  y -= 10;
  if (y < 200) { page = doc.addPage(A4); y = H - M; }

  // Pay To & Sub Total Block
  const rightBoxW = 200;
  const leftBoxW = contentW - rightBoxW - 10;
  
  // Left Box
  text("Pay To:", M, y, { size: 10, color: C.primary });
  text(`Bank Name: ${data.bankName}, ${data.bankBranch}`, M, y - 15, { size: 9 });
  text(`Bank Account No.: ${data.bankAccountNo}`, M, y - 30, { size: 9 });
  text(`Bank IFSC code: ${data.bankIfsc}`, M, y - 45, { size: 9 });
  text(`Account Holder's Name: ${data.companyName}`, M, y - 60, { size: 9 });

  // Right Box
  const rx = M + leftBoxW + 10;
  const hasGst = data.totals.gstPercentage > 0;
  const summaryH = 25 + (hasGst ? 40 : 0) + 25;
  page.drawRectangle({ x: rx, y: y - summaryH, width: rightBoxW, height: summaryH, borderColor: C.ink, borderWidth: 0.5 });
  
  // Sub Total
  page.drawLine({ start: { x: rx, y: y - 20 }, end: { x: rx + rightBoxW, y: y - 20 }, thickness: 0.5, color: C.ink });
  text("Sub Total", rx + 5, y - 12, { size: 9 });
  text(inr(data.totals.netTotal), rx + rightBoxW - 5, y - 12, { size: 9, align: "right" });
  
  // SGST/CGST
  const sgst = data.totals.gstAmount / 2;
  if (hasGst) {
    page.drawLine({ start: { x: rx, y: y - 40 }, end: { x: rx + rightBoxW, y: y - 40 }, thickness: 0.5, color: C.ink });
    text(`SGST@${(data.totals.gstPercentage / 2).toFixed(1)}%`, rx + 5, y - 32, { size: 9 });
    text(inr(sgst), rx + rightBoxW - 5, y - 32, { size: 9, align: "right" });
    text(`CGST@${(data.totals.gstPercentage / 2).toFixed(1)}%`, rx + 5, y - 52, { size: 9 });
    text(inr(sgst), rx + rightBoxW - 5, y - 52, { size: 9, align: "right" });
  }

  const totalTop = y - (hasGst ? 65 : 25);
  page.drawRectangle({ x: rx, y: totalTop - 25, width: rightBoxW, height: 25, color: C.totalsBg });
  text("Total", rx + 5, totalTop - 15, { size: 9, font: bold, color: C.white });
  text(inr(data.totals.grandTotal), rx + rightBoxW - 5, totalTop - 15, { size: 9, font: bold, color: C.white, align: "right" });
  
  y -= summaryH + 45;

  // Description
  text("Description", M, y, { size: 10, color: C.primary });
  text(`profile: " OASIS "`, M, y - 15, { size: 8 });
  const desc = "Supplying and fixing of Unplasticised Poly Vinyl Chloride (UPVC) 3 track sliding windows with mesh shutter - (2-glass shutters and 1-mesh shutter) duly manufactured using UPVC reinforced profiles (Composition of profile shall consists a minimum of 5.5 PHR of TiO2 and not more than 12 PHR of CaCo3 for every 100 parts of PVC resin) of (94mm x 45 mm)/(80 mm x 52 mm) x 2.20 mm for outer frames, (58 mm x 39 mm)/(54 mm x 38 mm) x 2.20mm for sliding shutter frames capable of mounting single glazing ally reinforced with system structurally reinforced with hot dip galvanized up to 50 microns of minimum thickness of 1.0/1.2 mm prefabricated & welded through fusion welding. The window sash shall be fitted with 5 mm thick clear float glass of reputed make and mesh shutter frame shall be (42 mm x 25mm)/(52 mm x 21.5 mm) x 2.0 mm fitted with Vinyl Coated Fiber mesh- on rollers/ pulley duly fixed with Grey colour TPV Gasket for sash & Glazing bead shall be co- extruded with Grey colour soft PVC. System shall have single point locking with Touch Lock and the system is to be installed at the site using anchor fasteners, silicon rubber sealant, easy glazing/deglazing at site etc., including cost and conveyance of all materials, accessories, labour charges for transportation, erection at site including overheads and contractors profit etc., complete for finished item of work";
  
  let dy = y - 30;
  for (const ln of wrap(desc, reg, 8, contentW)) {
    text(ln, M, dy, { size: 8 });
    dy -= 10;
  }
  
  y = dy - 15;

  // Amount In Words
  text("Estimate Amount In Words", M, y, { size: 10, color: C.primary });
  text(amountInWords(data.totals.grandTotal), M, y - 15, { size: 9 });

  y -= 40;

  // If we run out of space for Terms, new page
  if (y < 200) { page = doc.addPage(A4); y = H - M; }

  text("Terms And Conditions", M, y, { size: 10, color: C.primary });
  y -= 15;
  const terms = [
    "1) the proposal made is based on the routh measurements / dimensions provide to us once the order is confirmed accurate site measurements are taken again.hence there maybe increase or decrease in total SFT.",
    "2) A work order with contract detai need to be provide latter head duly signed along with advance payment.",
    "3) payments TERM: 30% Along with work order 50% after material delivery 20% after work completed",
    "4) delivery Date: 16 day's",
    "5) offer validity: 30 days from date of quatation",
    "Thank you for doing business with us."
  ];

  for (const t of terms) {
    for (const ln of wrap(t, reg, 8, contentW)) {
      text(ln, M, y, { size: 8 });
      y -= 12;
    }
  }

  y -= 30;
  text(`For: ${data.companyName}`, M, y, { size: 9 });
  
  // Authorized Signatory Box or text
  page.drawLine({ start: { x: M, y: y - 50 }, end: { x: M + 150, y: y - 50 }, thickness: 0.5, color: C.ink });
  text("Authorized Signatory", M + 75, y - 62, { size: 9, font: bold, align: "center" });

  return doc.save();
}
