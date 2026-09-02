"use client";

import "./quote.css";
import React, { useCallback, useEffect, useState } from "react";
import { Check, Edit3, X, CheckCircle2, XCircle, FileWarning, ShieldAlert, Download, Layers, Eye, FileText } from "lucide-react";
import { parseClientConfig } from "@/lib/types";
import { sqft, measuredLineSqft, measuredLineTotal, quotationTotals } from "@/lib/pricing";
import { WindowElevationSvg, detectWindowElevationType, getWindowElevationTitle } from "@/lib/window-elevation";

interface Quotation {
  id: string;
  quote_no: string;
  date: string;
  customer_name: string;
  reference: string;
  address: string;
  contact_no: string;
  transport_cost: number;
  email: string;
  status: string;
  include_gst: boolean;
  gst_percentage: number;
  client_id: string;
  advance_paid?: number;
  supplier_company?: string;
}

interface Item {
  code?: string;
  description: string;
  width?: number;
  height?: number;
  units: number;
  rate: number;
  glass?: string;
  bom_config?: Record<string, any>;
}

interface ClientConfig {
  companyName?: string;
  companyProprietor?: string;
  companyContact?: string;
  companyEmail?: string;
  companyAddress?: string;
  logoUrl?: string;
  landingPrimaryColor?: string;
}

export default function QuotationClient({ params }: { params: Promise<{ id: string }> }) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [measured, setMeasured] = useState<Item[]>([]);
  const [unmeasured, setUnmeasured] = useState<Item[]>([]);
  const [clientConfig, setClientConfig] = useState<ClientConfig>({});
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [viewMode, setViewMode] = useState<"both" | "doc" | "cad">("both");
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  const fetchData = useCallback(async (id: string) => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token") || "";
    setToken(t);
    try {
      const res = await fetch(`/api/quotation/${id}?token=${t}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Access denied");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setQuotation(data.quotation);
      setMeasured(data.measured);
      setUnmeasured(data.unmeasured);
      
      const config = parseClientConfig(data.clientConfig || {}, data.quotation.client_id);
      setClientConfig(config);
      
      const st = String(data.quotation.status || "").toLowerCase();
      if (st === "won" || st === "approved") setActionDone("approved");
      else if (st === "lost" || st === "rejected") setActionDone("rejected");
    } catch {
      setError("Failed to load quotation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split("/");
    const id = pathParts[pathParts.length - 1];
    fetchData(id);
  }, [fetchData]);

  const handleAction = async (action: "approve" | "reject" | "review") => {
    if (!quotation) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/quotation/${quotation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (data.ok) {
        if (action === "approve") setActionDone("approved");
        else if (action === "reject") setActionDone("rejected");
        else setActionDone("review");
        setQuotation((prev) => prev ? { ...prev, status: data.status } : prev);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to update quotation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Download the real PDF file.
   *
   * Replaces `window.print()`, which only ever opened the browser print dialog
   * — it produced no file, and in the WhatsApp/Instagram in-app browsers (how
   * almost every one of these links is actually opened) it frequently does
   * nothing at all.
   *
   * We fetch to a Blob first so that an error response renders as a readable
   * message instead of dumping raw JSON into a tab the user then has to close.
   * `URL.createObjectURL` + a synthetic <a download> is the widely-supported
   * path; if the browser blocks it (some in-app webviews disallow blob: URLs)
   * we fall back to a plain navigation — the endpoint already sends
   * `Content-Disposition: attachment`, so the download still happens.
   */
  const handleDownload = async () => {
    if (!quotation || downloading) return;
    setDownloading(true);
    setDownloadError("");
    const href = `/api/quotation/${quotation.id}/pdf?token=${encodeURIComponent(token)}`;
    const filename = `Quotation_${(quotation.quote_no || quotation.id).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
    try {
      const res = await fetch(href);
      if (!res.ok) {
        let msg = "Could not generate the PDF. Please try again.";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* non-JSON error body — keep the generic message */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick — revoking synchronously can cancel the
      // download in Safari before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (e: any) {
      // Last resort: let the browser handle it natively.
      try {
        window.location.href = href;
      } catch {
        setDownloadError(String(e?.message || "Download failed"));
      }
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="status-screen">
        <div className="status-card" style={{ boxShadow: "none", background: "transparent", border: "none" }}>
          <div className="spinner" />
          <p>Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-screen">
        <div className="status-card">
          <div className="status-icon error"><ShieldAlert size={32} /></div>
          <h2>Access Denied</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!quotation) return null;

  // MONEY MATH COMES FROM src/lib/pricing.ts — NEVER INLINE IT HERE.
  //
  // This page used to compute `(w * h * units) / 144`, i.e. it treated the
  // stored dimensions as INCHES. Every other surface in this repo (lib/models.dart,
  // which renders the PDF the customer is sent, and pricing.ts, which drives the
  // dashboard and all reports) treats them as MILLIMETRES: (w/304.8)*(h/304.8).
  // The two disagree by a factor of 645.16, so the price the customer saw on the
  // page they were asked to APPROVE bore no relation to the quotation. It also
  // added transport into `subtotal` and then taxed it as part of the same figure
  // while displaying transport as a separate line — double-presenting it.
  // `quotationTotals` is the single source of truth and matches the Dart exactly.
  const totals = quotationTotals(quotation, measured, unmeasured);
  const items = measured.map((m) => {
    const uSqft = sqft(m.width, m.height);
    const tSqft = measuredLineSqft(m);
    const amt = measuredLineTotal(m);
    return {
      ...m,
      unitSqft: Math.round(uSqft * 100) / 100,
      totalSqft: Math.round(tSqft * 100) / 100,
      amount: amt,
    };
  });
  const { netTotal, gstAmount, grandTotal } = totals;
  const advancePaid = Number(quotation.advance_paid) || 0;
  const balanceDue = Math.max(0, grandTotal - advancePaid);

  if (actionDone) {
    const isApproved = actionDone === "approved";
    const isRejected = actionDone === "rejected";
    return (
      <div className="status-screen">
        <div className="status-card">
          <div className={`status-icon ${isApproved ? "approved" : isRejected ? "rejected" : "review"}`}>
            {isApproved ? <CheckCircle2 size={36} /> : isRejected ? <XCircle size={36} /> : <FileWarning size={36} />}
          </div>
          <h2>
            {isApproved ? "Quotation Approved" : isRejected ? "Quotation Rejected" : "Review Requested"}
          </h2>
          <p>
            {isApproved
              ? "Thank you! Your confirmation has been recorded. We will contact you shortly to begin work."
              : isRejected
              ? "Your response has been recorded. Feel free to reach out if you have questions."
              : "Your request for changes has been noted. The business will review and get back to you."}
          </p>
          <small style={{ color: "var(--kpr-text-muted)" }}>Ref: {quotation.quote_no}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="quote-layout">
      
      <div className="invoice-document">
        <div className="invoice-content">
          
          {/* Document Header */}
          <header className="invoice-header">
            <div className="invoice-brand">
              {clientConfig.logoUrl && <img src={clientConfig.logoUrl} alt="Logo" />}
              <h1>{clientConfig.companyName || "Quotation"}</h1>
              {clientConfig.companyAddress && <p>{clientConfig.companyAddress}</p>}
              {clientConfig.companyContact && <p>Tel: {clientConfig.companyContact}</p>}
              {clientConfig.companyEmail && <p>Email: {clientConfig.companyEmail}</p>}
            </div>
            
            <div className="invoice-meta">
              <h2>QUOTATION</h2>
              <div className="meta-row">
                <span className="meta-label">Quote Number:</span>
                <span className="meta-value">{quotation.quote_no}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Date:</span>
                <span className="meta-value">
                  {new Date(quotation.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          </header>

          {/* Parties */}
          <section className="invoice-parties">
            <div className="party-box">
              <h3>Bill To</h3>
              <p><strong>{quotation.customer_name}</strong></p>
              {quotation.address && <p>{quotation.address}</p>}
              {quotation.contact_no && <p>Phone: {quotation.contact_no}</p>}
            </div>
            <div className="party-box">
              <h3>Project Details</h3>
              {quotation.reference && <p><strong>Ref:</strong> {quotation.reference}</p>}
              {clientConfig.companyProprietor && <p><strong>Prepared By:</strong> {clientConfig.companyProprietor}</p>}
            </div>
          </section>

          {/* View Mode Bar */}
          {items.length > 0 && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "#f1f5f9", padding: "6px", borderRadius: "8px", width: "fit-content" }}>
              <button
                type="button"
                onClick={() => setViewMode("both")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: viewMode === "both" ? "#ffffff" : "transparent",
                  color: viewMode === "both" ? "#0f172a" : "#64748b",
                  boxShadow: viewMode === "both" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <Layers size={14} /> Full Document &amp; CAD Schedule
              </button>
              <button
                type="button"
                onClick={() => setViewMode("doc")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: viewMode === "doc" ? "#ffffff" : "transparent",
                  color: viewMode === "doc" ? "#0f172a" : "#64748b",
                  boxShadow: viewMode === "doc" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <FileText size={14} /> Itemized Quotation
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cad")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: viewMode === "cad" ? "#ffffff" : "transparent",
                  color: viewMode === "cad" ? "#0f172a" : "#64748b",
                  boxShadow: viewMode === "cad" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <Eye size={14} /> CAD Window Elevations ({items.length})
              </button>
            </div>
          )}

          {/* Measured Items Table */}
          {items.length > 0 && (viewMode === "both" || viewMode === "doc") && (
            <section className="invoice-section">
              <h3 className="section-title">Measured Items (Windows &amp; Doors)</h3>
              <div className="table-wrapper">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>S.No</th>
                      <th>Description &amp; Specifications</th>
                      <th className="col-center">Size (W×H mm)</th>
                      <th className="col-center">Units</th>
                      <th className="col-center" title="Area of one unit in sq.ft">Unit SFT</th>
                      <th className="col-center" title="Total area in sq.ft (Units × Unit SFT)">Total SFT</th>
                      <th className="col-center">Rate/SFT</th>
                      <th className="col-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
      const profileType = String(item.bom_config?.profile?.type || item.bom_config?.profile?.system || "");
      const elevType = detectWindowElevationType(`${item.description} ${profileType}`);
                      const isExpanded = expandedItem === i;

                      return (
                        <React.Fragment key={i}>
                          <tr>
                            <td className="highlight" style={{ textAlign: "center" }}>{i + 1}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <strong>{item.description || getWindowElevationTitle(elevType, i + 1)}</strong>
                                {item.code && (
                                  <span style={{ fontSize: "10.5px", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", color: "#475569" }}>
                                    Code: {item.code}
                                  </span>
                                )}
                              </div>
                              {item.glass && (
                                <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                                  Glass: <em>{item.glass}</em>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedItem(isExpanded ? null : i)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--kpr-primary, #0b4b86)",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  padding: "2px 0",
                                  marginTop: "4px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  textDecoration: "underline",
                                }}
                              >
                                {isExpanded ? "Hide CAD Elevation ▲" : "View CAD Elevation ▼"}
                              </button>
                            </td>
                            <td className="col-center font-mono">
                              {item.width && item.height ? `${Math.round(item.width)} × ${Math.round(item.height)}` : "—"}
                            </td>
                            <td className="col-center" style={{ fontWeight: 600 }}>{item.units}</td>
                            <td className="col-center">{item.unitSqft.toFixed(2)}</td>
                            <td className="col-center" style={{ fontWeight: 600 }}>{item.totalSqft.toFixed(2)}</td>
                            <td className="col-center">₹{Number(item.rate).toLocaleString("en-IN")}</td>
                            <td className="col-right amount" style={{ fontWeight: 700 }}>₹{item.amount.toLocaleString("en-IN")}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="elevation-row-preview">
                              <td colSpan={8} style={{ background: "#f8fafc", padding: "16px", borderBottom: "2px solid #e2e8f0" }}>
                                <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                                  <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                    <WindowElevationSvg
                                      widthMm={item.width || 1000}
                                      heightMm={item.height || 1000}
                                      description={item.description}
                                      itemIndex={i + 1}
                                      targetWidth={260}
                                      targetHeight={280}
                                    />
                                  </div>
                                  <div style={{ maxWidth: "340px", fontSize: "13px", lineHeight: "1.6" }}>
                                    <h4 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
                                      {getWindowElevationTitle(elevType, i + 1)}
                                    </h4>
                                    <p style={{ margin: "4px 0", color: "#64748b" }}>
                                      <strong>Dimensions:</strong> {Math.round(item.width || 0)} mm (W) × {Math.round(item.height || 0)} mm (H)
                                    </p>
                                    <p style={{ margin: "4px 0", color: "#64748b" }}>
                                      <strong>Quantity:</strong> {item.units} unit{item.units > 1 ? "s" : ""}
                                    </p>
                                    <p style={{ margin: "4px 0", color: "#64748b" }}>
                                      <strong>Total Area:</strong> {item.totalSqft.toFixed(2)} sq.ft ({item.unitSqft.toFixed(2)} sq.ft / unit)
                                    </p>
                                    {item.glass && (
                                      <p style={{ margin: "4px 0", color: "#64748b" }}>
                                        <strong>Glass Spec:</strong> {item.glass}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Dedicated 2D CAD Elevation Diagrams & Dimension Schedule */}
          {items.length > 0 && (viewMode === "both" || viewMode === "cad") && (
            <section className="invoice-section cad-schedule-section" style={{ marginTop: "32px", paddingTop: "20px", borderTop: "2px dashed #cbd5e1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                <h3 className="section-title" style={{ margin: 0 }}>
                  2D CAD Elevation &amp; Dimension Schedule
                </h3>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Engineering Elevation Diagrams with Parametric Witness Lines
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "20px",
                }}
              >
                {items.map((m, idx) => {
                  const profileType = String(m.bom_config?.profile?.type || m.bom_config?.profile?.system || "");
                  const elevType = detectWindowElevationType(`${m.description} ${profileType}`);
                  const title = getWindowElevationTitle(elevType, idx + 1);

                  return (
                    <div
                      key={idx}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b" }}>{title}</span>
                        <span style={{ fontSize: "11px", fontWeight: 600, background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", color: "#475569" }}>
                          Qty: {m.units}
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "280px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: "6px", overflow: "hidden" }}>
                        <WindowElevationSvg
                          widthMm={m.width || 1000}
                          heightMm={m.height || 1000}
                          description={m.description}
                          itemIndex={idx + 1}
                          targetWidth={270}
                          targetHeight={275}
                        />
                      </div>
                      <div style={{ width: "100%", marginTop: "12px", fontSize: "12px", color: "#475569", lineHeight: "1.6" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Dimensions:</span>
                          <strong className="font-mono">{Math.round(m.width || 0)} × {Math.round(m.height || 0)} mm</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Area:</span>
                          <strong>{m.totalSqft.toFixed(2)} sq.ft ({m.unitSqft.toFixed(2)} / unit)</strong>
                        </div>
                        {m.glass && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Glass:</span>
                            <span style={{ fontWeight: 600, color: "#2563eb" }}>{m.glass}</span>
                          </div>
                        )}
                        {m.code && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Code:</span>
                            <span>{m.code}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Unmeasured Items */}
          {unmeasured.length > 0 && (viewMode === "both" || viewMode === "doc") && (
            <section className="invoice-section">
              <h3 className="section-title">Additional Items &amp; Services</h3>
              <div className="table-wrapper">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>S.No</th>
                      <th>Description</th>
                      <th className="col-center">Qty</th>
                      <th className="col-center">Rate</th>
                      <th className="col-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmeasured.map((item, i) => (
                      <tr key={i}>
                        <td className="highlight" style={{ textAlign: "center" }}>{i + 1}</td>
                        <td className="highlight">{item.description}</td>
                        <td className="col-center">{item.units}</td>
                        <td className="col-center">₹{Number(item.rate).toLocaleString("en-IN")}</td>
                        <td className="col-right amount">₹{(item.units * item.rate).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Totals Box */}
          <section className="invoice-totals">
            <div className="totals-box">
              <div className="total-row">
                <span>Total Area (SFT)</span>
                <span>{totals.totalSqft.toFixed(2)} sq.ft</span>
              </div>
              <div className="total-row">
                <span>Subtotal</span>
                <span>₹{totals.subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              {totals.transport > 0 && (
                <div className="total-row">
                  <span>Transport &amp; Handling</span>
                  <span>₹{totals.transport.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              {totals.gstPercentage > 0 && (
                <>
                  <div className="total-row">
                    <span>Taxable Value</span>
                    <span>₹{netTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="total-row">
                    <span>GST ({totals.gstPercentage}%)</span>
                    <span>₹{gstAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                </>
              )}
              <div className="total-row grand-total">
                <span>Grand Total</span>
                <span>₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              {advancePaid > 0 && (
                <>
                  <div className="total-row" style={{ color: "#15803d", fontWeight: 600 }}>
                    <span>Advance Paid</span>
                    <span>- ₹{advancePaid.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="total-row balance-due" style={{ fontWeight: 800, fontSize: "16px", color: "#b91c1c", borderTop: "2px solid #e2e8f0", paddingTop: "8px", marginTop: "4px" }}>
                    <span>Balance Due</span>
                    <span>₹{balanceDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Actions - Attached to bottom of document */}
        <div className="invoice-actions">
          <h3>Customer Confirmation</h3>
          <p>Please review the details above and confirm your decision to proceed.</p>
          <div className="action-buttons">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn"
              style={{ backgroundColor: "#2d3748", color: "white" }}
            >
              <Download size={18} /> {downloading ? "Preparing PDF..." : "Download PDF"}
            </button>
            <button onClick={() => handleAction("approve")} disabled={submitting} className="btn btn-approve">
              <Check size={18} /> Approve Quotation
            </button>
            <button onClick={() => handleAction("review")} disabled={submitting} className="btn btn-review">
              <Edit3 size={18} /> Request Changes
            </button>
            <button onClick={() => handleAction("reject")} disabled={submitting} className="btn btn-reject">
              <X size={18} /> Reject
            </button>
          </div>
          {downloadError && (
            <p style={{ color: "#c53030", marginTop: 12, fontSize: 14 }}>{downloadError}</p>
          )}
        </div>
      </div>
      
      <footer className="invoice-footer">
        Generated securely via Vitharn UPVC Quotation System
      </footer>

    </div>
  );
}
