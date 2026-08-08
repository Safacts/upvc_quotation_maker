/**
 * console-format.ts — display formatting for the desktop console.
 *
 * Presentation only. NOTHING here may perform arithmetic that affects a stored
 * value — every rupee figure arrives already computed by `src/lib/pricing.ts`.
 * Rounding inside a formatter is how a screen ends up disagreeing with the PDF.
 */

/**
 * Indian digit grouping: 1,23,456.78 — lakhs and crores, not thousands.
 *
 * `en-IN` is not cosmetic. A fabricator reading "1,234,567" has to stop and
 * count digits; "12,34,567" is read instantly. Getting this wrong is a small
 * thing that makes software feel foreign.
 */
const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Guard every formatter: one NaN would otherwise render as "₹NaN" across a whole screen. */
function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Money with two decimals: "Rs. 1,23,456.78".
 *
 * "Rs." not "₹" — deliberate and load-bearing. pdf-lib cannot encode U+20B9
 * with the WinAnsi standard fonts and THROWS when asked (see invoice-pdf.ts),
 * so every PDF in this product prints "Rs.". The console preview claims to show
 * what the customer will receive; using a different currency mark here would
 * make that claim false on the one screen whose entire purpose is fidelity.
 */
export function formatMoney(value: unknown): string {
  return "Rs. " + inrFormatter.format(safeNum(value));
}

/** Money without decimals, for KPI tiles where paisa is noise. */
export function formatMoneyCompact(value: unknown): string {
  return "Rs. " + inrCompactFormatter.format(Math.round(safeNum(value)));
}

/** Bare number with Indian grouping and 2 dp — for table cells with a header unit. */
export function formatAmount(value: unknown): string {
  return inrFormatter.format(safeNum(value));
}

/** Square feet, 2 dp. Area is not money; it does not get a currency prefix. */
export function formatSqft(value: unknown): string {
  return safeNum(value).toFixed(2);
}

/** Integer-ish quantity display that drops a pointless ".00". */
export function formatQty(value: unknown): string {
  const n = safeNum(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Date as DD-MM-YYYY — Indian convention, and the format used throughout the
 * agent memory files. Never MM-DD-YYYY: "05-08-2026" would silently mean two
 * different days to a US-locale reader and an Indian one.
 */
export function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Date + time, for audit-style columns. */
export function formatDateTime(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return String(value);
  const time = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatDate(value)} ${time}`;
}

/** `<input type="date">` requires exactly YYYY-MM-DD; anything else renders blank. */
export function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Accept the DD-MM-YYYY the Flutter app may have written into `date`.
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Relative age for follow-up lists: "3 days ago". */
export function formatRelative(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

/**
 * Escape a value for RFC 4180 CSV.
 *
 * Two things that break Excel and are easy to miss:
 *  - a field containing a comma, quote or newline must be quoted, with inner
 *    quotes doubled;
 *  - a value starting with = + - @ is executed as a FORMULA by Excel. A customer
 *    named "=cmd|..." becomes CSV injection on the accountant's machine, so such
 *    values are prefixed with a single quote.
 */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  if (/[",\n\r]/.test(guarded)) {
    return '"' + guarded.replace(/"/g, '""') + '"';
  }
  return guarded;
}

/** Build a CSV document with a UTF-8 BOM so Excel renders Indian names correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // CRLF per RFC 4180; the BOM stops Excel guessing the encoding as ANSI.
  return "\ufeff" + lines.join("\r\n");
}

/** Trigger a client-side file download without a server round trip. */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking synchronously can cancel the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
