"use client";

import { useEffect, useState } from "react";
import { measuredLineSqft, measuredLineTotal, unmeasuredLineTotal } from "@/lib/pricing";
import type { QuotationTotals } from "@/lib/pricing";
import { formatAmount, formatDate, formatMoney, formatSqft } from "@/lib/console-format";

/**
 * LivePreview — a render of the document the customer will actually receive,
 * updating as the user types.
 *
 * ============================================================================
 *  THIS IS THE ANSWER TO "WE CAN'T SEE WHAT WE ENTERED"
 * ============================================================================
 * Not a PDF round trip. A PDF regenerated per keystroke would cost a request
 * each time, take hundreds of milliseconds, and make the preview feel like a
 * report you run rather than a document you are writing. This is plain DOM
 * rendered from the same state the editor holds.
 *
 * ============================================================================
 *  FIDELITY IS THE WHOLE CONTRACT
 * ============================================================================
 * A preview that disagrees with the PDF is worse than no preview: the user
 * trusts it, sends the quotation, and the customer receives a different number.
 * Two rules keep them aligned:
 *
 *  1. EVERY figure here comes from `src/lib/pricing.ts` — the same module the
 *     API, the Vitest parity fixtures and (mirrored) `lib/models.dart` use.
 *     There is no arithmetic in this file.
 *  2. Currency prints as "Rs.", never the ₹ glyph. pdf-lib cannot encode U+20B9
 *     with the WinAnsi standard fonts and throws, so every generated PDF says
 *     "Rs." — the preview must say the same or it is lying about its own output.
 */

interface PreviewMeasured {
  key: string;
  code: string;
  description: string;
  glass: string;
  width: string;
  height: string;
  units: string;
  rate: string;
}

interface PreviewUnmeasured {
  key: string;
  description: string;
  units: string;
  rate: string;
}

interface PreviewHeader {
  quote_no: string;
  date: string;
  customer_name: string;
  contact_no: string;
  email: string;
  address: string;
  reference: string;
  include_gst: boolean;
  gst_percentage: string;
}

/**
 * Debounce the RENDER, not the numbers.
 *
 * The totals strip in the editor updates instantly — that is the immediate
 * feedback the user is typing against. The document preview redraws a whole
 * table, so it is throttled to 200 ms to keep keystrokes smooth on a modest
 * office laptop.
 *
 * The subtle bug this avoids: the delay must be applied to the RENDERED COPY,
 * never to the source of truth. If the editor's own totals were debounced too,
 * a user who typed a rate and hit Ctrl+S within the window would save while the
 * screen still showed the previous total.
 */
function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function LivePreview({
  header,
  measured,
  unmeasured,
  totals,
  companyName,
  companyAddress,
  companyContact,
  gstNumber,
}: {
  header: PreviewHeader;
  measured: PreviewMeasured[];
  unmeasured: PreviewUnmeasured[];
  totals: QuotationTotals;
  companyName: string;
  companyAddress?: string;
  companyContact?: string;
  gstNumber?: string;
}) {
  const view = useDebounced({ header, measured, unmeasured, totals }, 200);

  // Blank rows are not rendered. The user is mid-typing; showing an empty
  // numbered line in the customer-facing preview implies it will be printed.
  const rows = view.measured.filter(
    (m) => m.code || m.description || m.width || m.height || m.rate,
  );
  const extras = view.unmeasured.filter((u) => u.description || u.rate);
  const isEmpty = rows.length === 0 && extras.length === 0;

  return (
    <div className="vc-preview">
      <div className="vc-pv-head">
        <div>
          <div className="vc-pv-co">{companyName || "Your Company"}</div>
          {companyAddress && <div className="vc-pv-meta">{companyAddress}</div>}
          {companyContact && <div className="vc-pv-meta">{companyContact}</div>}
          {gstNumber && <div className="vc-pv-meta">GSTIN: {gstNumber}</div>}
        </div>
        <div>
          <div className="vc-pv-title">Quotation</div>
          <div className="vc-pv-meta" style={{ textAlign: "right" }}>
            {view.header.quote_no || "— no number —"}
          </div>
          <div className="vc-pv-meta" style={{ textAlign: "right" }}>
            {formatDate(view.header.date)}
          </div>
        </div>
      </div>

      <div className="vc-pv-to">
        <div className="vc-pv-to-label">Quotation For</div>
        <div className="vc-pv-to-name">{view.header.customer_name || "—"}</div>
        {view.header.address && <div className="vc-pv-meta">{view.header.address}</div>}
        {view.header.contact_no && <div className="vc-pv-meta">{view.header.contact_no}</div>}
        {view.header.email && <div className="vc-pv-meta">{view.header.email}</div>}
        {view.header.reference && (
          <div className="vc-pv-meta">Ref: {view.header.reference}</div>
        )}
      </div>

      {isEmpty && (
        <div className="vc-pv-empty">
          Line items appear here as you type. Press <b>Alt+I</b> to add a row.
        </div>
      )}

      {rows.length > 0 && (
        <table className="vc-pv-table">
          <thead>
            <tr>
              <th style={{ width: 20 }}>#</th>
              <th>Description</th>
              <th style={{ width: 68 }}>Size (mm)</th>
              <th style={{ width: 26 }}>Qty</th>
              <th style={{ width: 40 }}>Sqft</th>
              <th style={{ width: 46 }}>Rate</th>
              <th style={{ width: 62 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.key}>
                <td>{i + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.description || m.code || "Item"}</div>
                  {m.glass && <div style={{ color: "#8a94a1" }}>{m.glass}</div>}
                </td>
                <td>
                  {m.width || 0} × {m.height || 0}
                </td>
                <td style={{ textAlign: "right" }}>{m.units || 1}</td>
                <td style={{ textAlign: "right" }}>
                  {formatSqft(
                    measuredLineSqft({ width: m.width, height: m.height, units: m.units }),
                  )}
                </td>
                <td style={{ textAlign: "right" }}>{formatAmount(m.rate)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {formatAmount(
                    measuredLineTotal({
                      width: m.width,
                      height: m.height,
                      units: m.units,
                      rate: m.rate,
                    }),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {extras.length > 0 && (
        <table className="vc-pv-table">
          <thead>
            <tr>
              <th style={{ width: 20 }}>#</th>
              <th>Other Items</th>
              <th style={{ width: 30 }}>Qty</th>
              <th style={{ width: 50 }}>Rate</th>
              <th style={{ width: 62 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {extras.map((u, i) => (
              <tr key={u.key}>
                <td>{i + 1}</td>
                <td>{u.description || "Item"}</td>
                <td style={{ textAlign: "right" }}>{u.units || 1}</td>
                <td style={{ textAlign: "right" }}>{formatAmount(u.rate)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {formatAmount(unmeasuredLineTotal({ units: u.units, rate: u.rate }))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="vc-pv-tot">
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td>{formatAmount(view.totals.subtotal)}</td>
          </tr>
          {view.totals.transport > 0 && (
            <tr>
              <td>Transport</td>
              <td>{formatAmount(view.totals.transport)}</td>
            </tr>
          )}
          {/* GST is shown only when it applies, exactly as the PDF does. A
              "GST 0.00" line on a non-GST quotation invites the customer to ask
              why they are being charged nothing for tax. */}
          {view.totals.gstPercentage > 0 && (
            <tr>
              <td>GST @ {view.totals.gstPercentage}%</td>
              <td>{formatAmount(view.totals.gstAmount)}</td>
            </tr>
          )}
          <tr className="vc-pv-grand">
            <td>Grand Total</td>
            <td>{formatMoney(view.totals.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 9.5, color: "#8a94a1", lineHeight: 1.5 }}>
        Live preview · {formatSqft(view.totals.totalSqft)} sqft total. Figures are
        calculated by the same engine that generates your PDF.
      </div>
    </div>
  );
}
