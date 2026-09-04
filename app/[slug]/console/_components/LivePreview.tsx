"use client";

import { useEffect, useState } from "react";
import { measuredLineSqft, measuredLineTotal, unmeasuredLineTotal } from "@/lib/pricing";
import type { QuotationTotals } from "@/lib/pricing";
import { formatAmount, formatDate, formatMoney, formatSqft } from "@/lib/console-format";
import {
  detectWindowElevationType,
  getWindowElevationTitle,
  WindowElevationSvg,
} from "@/lib/window-elevation";
import { FileText, Compass, Layers } from "lucide-react";

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
  focusedIndex,
}: {
  header: PreviewHeader;
  measured: PreviewMeasured[];
  unmeasured: PreviewUnmeasured[];
  totals: QuotationTotals;
  companyName: string;
  companyAddress?: string;
  companyContact?: string;
  gstNumber?: string;
  focusedIndex?: number | null;
}) {
  const [viewMode, setViewMode] = useState<"doc" | "cad" | "both">("both");
  const view = useDebounced({ header, measured, unmeasured, totals }, 200);

  const rows = view.measured.filter(
    (m) => m.code || m.description || m.width || m.height || m.rate,
  );
  const extras = view.unmeasured.filter((u) => u.description || u.rate);
  const isEmpty = rows.length === 0 && extras.length === 0;

  // Filter valid items with width & height for CAD elevation diagrams
  const elevationItems = rows
    .map((m, idx) => ({ ...m, origIndex: idx + 1 }))
    .filter((m) => Number(m.width) > 0 && Number(m.height) > 0);

  return (
    <div className="vc-preview" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* View Mode Selector Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 6,
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: 8,
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <button
            type="button"
            className={`vc-btn vc-btn-sm ${viewMode === "both" ? "vc-btn-primary" : ""}`}
            style={{ fontSize: 11, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setViewMode("both")}
            title="Full customer schedule with both document and 2D CAD window diagrams"
          >
            <Layers size={13} /> Full Schedule
          </button>
          <button
            type="button"
            className={`vc-btn vc-btn-sm ${viewMode === "cad" ? "vc-btn-primary" : ""}`}
            style={{ fontSize: 11, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setViewMode("cad")}
            title="Show only 2D CAD Window Elevation diagrams"
          >
            <Compass size={13} /> 2D CAD Elevations ({elevationItems.length})
          </button>
          <button
            type="button"
            className={`vc-btn vc-btn-sm ${viewMode === "doc" ? "vc-btn-primary" : ""}`}
            style={{ fontSize: 11, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setViewMode("doc")}
            title="Customer quotation document layout"
          >
            <FileText size={13} /> Document Only
          </button>
        </div>
        <span style={{ fontSize: 10, color: "#718096", fontWeight: 600 }}>LIVE PREVIEW</span>
      </div>

      {/* DOCUMENT VIEW (Header + Lines + Totals) */}
      {(viewMode === "doc" || viewMode === "both") && (
        <>
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
                  <tr key={m.key} style={focusedIndex === i ? { backgroundColor: "#f7fafc" } : {}}>
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
        </>
      )}

      {/* 2D CAD ELEVATION SCHEDULE (Visible in 'cad' or 'both' view) */}
      {(viewMode === "cad" || viewMode === "both") && elevationItems.length > 0 && (
        <div
          style={{
            marginTop: viewMode === "both" ? 14 : 4,
            paddingTop: viewMode === "both" ? 12 : 4,
            borderTop: viewMode === "both" ? "2px dashed #cbd5e0" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a202c" }}>
              📐 2D CAD Window Elevation Schedule
            </div>
            <div style={{ fontSize: 10, color: "#718096" }}>
              {elevationItems.length} window unit{elevationItems.length > 1 ? "s" : ""}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            {elevationItems.map((item) => {
              const type = detectWindowElevationType(item.description);
              const title = getWindowElevationTitle(type, item.origIndex);
              const wMm = Number(item.width) || 0;
              const hMm = Number(item.height) || 0;
              const itemSqft = measuredLineSqft({
                width: item.width,
                height: item.height,
                units: item.units,
              });

              return (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: 8,
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      textAlign: "center",
                      borderBottom: "1px solid #edf2f7",
                      paddingBottom: 6,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#2d3748" }}>{title}</div>
                    <div style={{ fontSize: 9.5, color: "#718096" }}>
                      {wMm} × {hMm} mm · {formatSqft(itemSqft)} sqft · Qty: {item.units || 1}
                    </div>
                    {item.glass && (
                      <div
                        style={{
                          fontSize: 8.5,
                          color: "#4a5568",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.glass}
                      </div>
                    )}
                  </div>

                  {/* Standalone Vector SVG Drawing */}
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      padding: "4px 0",
                    }}
                  >
                    <WindowElevationSvg
                      widthMm={wMm}
                      heightMm={hMm}
                      description={item.description}
                      itemIndex={item.origIndex}
                      targetWidth={210}
                      targetHeight={220}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 9.5, color: "#8a94a1", lineHeight: 1.5 }}>
        Live preview · {formatSqft(view.totals.totalSqft)} sqft total. Window elevations update live in real-time.
      </div>
    </div>
  );
}
