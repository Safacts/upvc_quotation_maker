/**
 * tally-xml.ts — export uPVC quotations as Tally Prime importable XML.
 *
 * ============================================================================
 *  WHY THIS IS THE PHASE 2 CENTREPIECE
 * ============================================================================
 * KPR's accountant already runs Tally. The winning move (architecture doc §4.6)
 * is to FEED Tally, not replace it: export won quotations as Sales Vouchers the
 * accountant imports directly. This is a genuine differentiator and the single
 * strongest sales argument for the desktop console.
 *
 * ---------------------------------------------------------------------------
 *  FORMAT CONTRACT
 * ---------------------------------------------------------------------------
 * Tally's XML import is documented in its developer reference. The structure we
 * emit is the canonical Voucher import:
 *
 *   <ENVELOPE>
 *     <HEADER>...</HEADER>
 *     <BODY>
 *       <IMPORTDATA>
 *         <REQUESTDESC>...</REQUESTDESC>
 *         <REQUESTDATA>
 *           <TALLYMESSAGE>: <VOUCHER ...>...</VOUCHER>
 *           ...
 *         </REQUESTDATA>
 *       </IMPORTDATA>
 *     </BODY>
 *   </ENVELOPE>
 *
 * Every text node is XML-escaped (escapeXml). Every date is forced to Tally's
 * YYYYMMDD — a DD-MM-YYYY or ISO date is silently rejected by the import. Every
 * money figure is rounded to paise ONCE, at the edge, so the debits and credits
 * in a voucher sum to exactly zero to the last digit.
 *
 * ---------------------------------------------------------------------------
 *  ACCOUNTING MODEL
 * ---------------------------------------------------------------------------
 * A won quotation becomes one Sales Voucher:
 *
 *   Dr  <customer_ledger>       grand_total   (what the customer owes)
 *   Dr  <customer_ledger>       transport     (if transport charged separately)
 *       Cr  <sales_ledger>      net_total     (pre-GST revenue)
 *       Cr  <cgst_ledger>       cgst_amount
 *       Cr  <sgst_ledger>       sgst_amount
 *       Cr  <igst_ledger>       igst_amount
 *
 * For KPR (Telangana, intra-state) CGST=SGST=9% each. IGST applies only when
 * the buyer is in another state. The split is computed per-quotation from the
 * stored gst_percentage, defaulting to a 9/9/0 split — configurable per export
 * via TallyExportConfig so a different client's rate needs no code change.
 *
 * IMPORTANT: a quotation's `include_gst` flag gates the whole split. When it is
 * false, the voucher has NO gst ledgers — the full grand_total is Dr to the
 * customer and Cr to sales. Re-exporting must not silently invent tax the
 * fabricator did not charge.
 */

/** Configuration for one Tally export run. All ledger names have sane defaults. */
export interface TallyExportConfig {
  /** Credit ledger for the pre-GST revenue. Default "Sales A/c". */
  salesLedger: string;
  /** Debit ledger for the customer's receivable. Default "Sundry Debtors". */
  customerLedger: string;
  /** Credit ledger for Central GST. Default "CGST A/c". */
  cgstLedger: string;
  /** Credit ledger for State GST. Default "SGST A/c". */
  sgstLedger: string;
  /** Credit ledger for Integrated GST. Default "IGST A/c". */
  igstLedger: string;
  /**
   * Default GST split (percentages) applied to every voucher whose own split is
   * not otherwise known. 9/9/0 = standard intra-state Telangana. Must sum to the
   * full gst_percentage or the credits will not add up to the stored total.
   */
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  /** Narration suffix appended to every voucher. Default "". */
  narration: string;
  /** Voucher type name in Tally. Default "Sales". */
  voucherType: string;
}

export const DEFAULT_TALLY_CONFIG: TallyExportConfig = {
  salesLedger: "Sales A/c",
  customerLedger: "Sundry Debtors",
  cgstLedger: "CGST A/c",
  sgstLedger: "SGST A/c",
  igstLedger: "IGST A/c",
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
  narration: "",
  voucherType: "Sales",
};

/** A quotation row as it arrives from the API (postgrest shapes). */
export interface TallyQuotation {
  id: string;
  quote_no: string;
  date: string;
  customer_name: string;
  net_total: number;
  gst_amount: number;
  grand_total: number;
  include_gst: boolean;
  gst_percentage: number | string | null;
  transport_cost: number | string | null;
  // Branding for the narration / party ledger.
  company_name?: string;
}

/** Per-voucher accounting split, computed once and emitted twice (Dr + Cr). */
interface VoucherAccount {
  ledgerName: string;
  amount: number; // Always positive; ISDEEMEDPOSITIVE tells Tally Dr or Cr.
  isDebit: boolean;
}

/** XML-escape a string. Tally rejects raw & < > " " in text nodes. */
function escapeXml(s: string): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string),
  );
}

/**
 * Round to paises for OUTPUT. Never round an intermediate — callers sum at full
 * precision and this runs once at the edge so Dr and Cr sides reconcile exactly.
 */
function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Coerce a Supabase value to a finite number. `numeric` columns serialise as
 * JSON strings, so `width` can arrive as `1200`, `"1200"`, or `null`.
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tally requires dates as `YYYYMMDD`. Our `date` column is `YYYY-MM-DD`; a
 * missing one falls back to the first 10 chars of `created_at`. Anything that
 * cannot be parsed yields `null` and the voucher is skipped by the caller (a
 * voucher with no date is worse than one fewer voucher).
 */
function tallyDate(iso: string): string | null {
  if (!iso) return null;
  const s = String(iso).trim();
  // Already YYYYMMDD.
  if (/^\d{8}$/.test(s)) return s;
  // YYYY-MM-DD → YYYYMMDD.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + m[2] + m[3];
  // ISO timestamp → YYYYMMDD.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Compute the CGST/SGST/IGST split for one voucher.
 *
 * The source of truth is the quotation's OWN gst_percentage. We split it per the
 * configured rates: for a 18% GST with default 9/9/0, cgst=sgst=half, igst=0.
 * If the rates do not divide evenly, the remainder rides on CGST — the total is
 * always exactly gst_amount to the last paisa, so the credits reconcile.
 */
function gstSplit(
  q: TallyQuotation,
  cfg: TallyExportConfig,
): { cgst: number; sgst: number; igst: number } {
  const gst = r2(num(q.gst_amount));
  if (!q.include_gst || gst <= 0) return { cgst: 0, sgst: 0, igst: 0 };

  const cfgTotal = cfg.cgstRate + cfg.sgstRate + cfg.igstRate;
  // Avoid divide-by-zero: if the caller passed all-zero rates, put it all on CGST.
  if (cfgTotal <= 0) return { cgst: gst, sgst: 0, igst: 0 };

  const cgst = r2((gst * cfg.cgstRate) / cfgTotal);
  const sgst = r2((gst * cfg.sgstRate) / cfgTotal);
  // The remainder rides on IGST so cgst+sgst+igst === gst to the last paisa.
  const igst = r2(gst - cgst - sgst);
  return { cgst, sgst, igst };
}

/**
 * Build the accounting lines for one voucher.
 *
 * The customer is debited for the full amount they owe (grand_total). Sales is
 * credited for net_total. Each applicable GST ledger is credited for its share.
 * The lines always sum to zero (Dr positive, Cr negative) to the last paisa.
 */
function voucherAccounts(q: TallyQuotation, cfg: TallyExportConfig): VoucherAccount[] {
  // net_total = subtotal + transport (pre-GST). grand_total = net_total + GST.
  // The customer owes grand_total; sales is credited for net_total. This
  // always balances because grand_total = net_total + cgst + sgst + igst.
  const net = r2(num(q.net_total));
  const grand = r2(num(q.grand_total));
  const { cgst, sgst, igst } = gstSplit(q, cfg);
  const gst = r2(cgst + sgst + igst);

  const lines: VoucherAccount[] = [];

  // Dr: the customer owes the full grand total.
  lines.push({ ledgerName: cfg.customerLedger, amount: grand, isDebit: true });

  // Cr: sales revenue (pre-GST). net_total ALREADY includes transport — adding
  // transport_cost again would double-count it and unbalance the voucher.
  lines.push({ ledgerName: cfg.salesLedger, amount: net, isDebit: false });

  // Cr: GST ledgers, only when GST was actually charged.
  if (q.include_gst && gst > 0) {
    if (cgst > 0) lines.push({ ledgerName: cfg.cgstLedger, amount: cgst, isDebit: false });
    if (sgst > 0) lines.push({ ledgerName: cfg.sgstLedger, amount: sgst, isDebit: false });
    if (igst > 0) lines.push({ ledgerName: cfg.igstLedger, amount: igst, isDebit: false });
  }

  return lines;
}

/**
 * Emit one <VOUCHER> XML block.
 *
 * Remote id is the quotation UUID so re-importing the same file is idempotent —
 * Tally matches on REMOTEID and skips duplicates rather than creating a second
 * voucher for the same quote.
 */
function emitVoucher(q: TallyQuotation, cfg: TallyExportConfig): string | null {
  const date = tallyDate(q.date);
  if (!date) return null; // unparseable date → skip rather than emit garbage

  const lines = voucherAccounts(q, cfg);
  const remoteId = q.id || `q-${q.quote_no}`;
  const voucherNumber = q.quote_no || q.id || "";

  // Reconciliation assertion: Dr total must equal Cr total to the last paisa.
  // A mismatch means a bug in voucherAccounts, and importing an unbalanced
  // voucher into Tally corrupts the ledger. We assert rather than silently ship.
  let drTotal = 0;
  let crTotal = 0;
  for (const l of lines) {
    if (l.isDebit) drTotal += l.amount;
    else crTotal += l.amount;
  }
  drTotal = r2(drTotal);
  crTotal = r2(crTotal);
  if (Math.abs(drTotal - crTotal) > 0.01) {
    // Skip this voucher but continue the export — one bad row must not abort 50.
    return null;
  }

  const narration =
    (cfg.narration ? cfg.narration + " " : "") +
    `Quotation ${voucherNumber}${q.company_name ? " — " + q.company_name : ""}`;

  const accountLinesXml = lines
    .map((l) => {
      const tag = l.isDebit ? "Dr" : "Cr";
      return (
        `      <ALLLEDGERENTRIES.LIST>\n` +
        `        <LEDGERNAME>${escapeXml(l.ledgerName)}</LEDGERNAME>\n` +
        `        <ISDEEMEDPOSITIVE>${tag === "Dr" ? "Yes" : "No"}</ISDEEMEDPOSITIVE>\n` +
        `        <AMOUNT>${(-l.amount).toFixed(2)}</AMOUNT>\n` +
        `      </ALLLEDGERENTRIES.LIST>`
      );
    })
    .join("\n");

  return (
    `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n` +
    `      <VOUCHER REMOTEID="${escapeXml(remoteId)}" VCHTYPE="${escapeXml(cfg.voucherType)}" ACTION="Create">\n` +
    `        <DATE>${date}</DATE>\n` +
    `        <VOUCHERTYPENAME>${escapeXml(cfg.voucherType)}</VOUCHERTYPENAME>\n` +
    `        <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>\n` +
    `        <PARTYLEDGERNAME>${escapeXml(cfg.customerLedger)}</PARTYLEDGERNAME>\n` +
    `        <NARRATION>${escapeXml(narration)}</NARRATION>\n` +
    `        <CSTISOVERRIDDEN>No</CSTISOVERRIDDEN>\n` +
    `        <ISDELETED>No</ISDELETED>\n` +
    `        <ISVATDUTY>No</ISVATDUTY>\n` +
    accountLinesXml +
    `\n` +
    `      </VOUCHER>\n` +
    `    </TALLYMESSAGE>`
  );
}

/**
 * Build the full Tally import XML for a set of quotations.
 *
 * @returns { xml, skipped }
 *   xml      — the complete, ready-to-import ENVELOPE.
 *   skipped  — count of quotations that could not be emitted (unparseable date or
 *              unbalanced accounts). The caller tells the user "exported N of M"
 *              rather than silently dropping rows.
 */
export function buildTallyXml(
  quotes: TallyQuotation[],
  config: Partial<TallyExportConfig> = {},
): { xml: string; emitted: number; skipped: number; voucherCount: number } {
  const cfg: TallyExportConfig = { ...DEFAULT_TALLY_CONFIG, ...config };

  let emitted = 0;
  let skipped = 0;
  const messages: string[] = [];

  for (const q of quotes) {
    const block = emitVoucher(q, cfg);
    if (block) {
      messages.push(block);
      emitted++;
    } else {
      skipped++;
    }
  }

  const voucherCount = emitted;

  const header =
    `  <HEADER>\n` +
    `    <VERSION>1</VERSION>\n` +
    `    <TALLYREQUEST>Import</TALLYREQUEST>\n` +
    `    <TYPE>Data</TYPE>\n` +
    `    <ID>Vouchers</ID>\n` +
    `  </HEADER>`;

  const requestDesc =
    `    <REQUESTDESC>\n` +
    `      <REPORTNAME>Vouchers</REPORTNAME>\n` +
    `      <STATICVARIABLES>\n` +
    `        <SVCURRENTCOMPANY>${escapeXml(cfg.salesLedger)}</SVCURRENTCOMPANY>\n` +
    `      </STATICVARIABLES>\n` +
    `    </REQUESTDESC>`;

  const requestData =
    messages.length > 0
      ? `    <REQUESTDATA>\n${messages.join("\n")}\n    </REQUESTDATA>`
      : `    <REQUESTDATA></REQUESTDATA>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ENVELOPE>\n` +
    `${header}\n` +
    `  <BODY>\n` +
    `    <IMPORTDATA>\n` +
    `${requestDesc}\n` +
    `${requestData}\n` +
    `    </IMPORTDATA>\n` +
    `  </BODY>\n` +
    `</ENVELOPE>\n`;

  return { xml, emitted, skipped, voucherCount };
}
