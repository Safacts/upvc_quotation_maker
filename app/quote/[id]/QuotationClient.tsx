"use client";

import "./quote.css";
import { useCallback, useEffect, useState } from "react";
import { Check, Edit3, X, CheckCircle2, XCircle, FileWarning, ShieldAlert, Download } from "lucide-react";
import { parseClientConfig } from "@/lib/types";
import { measuredLineSqft, measuredLineTotal, quotationTotals } from "@/lib/pricing";

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
}

interface Item {
  code?: string;
  description: string;
  width?: number;
  height?: number;
  units: number;
  rate: number;
  glass?: string;
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
      
      if (data.quotation.status === "won") setActionDone("approved");
      else if (data.quotation.status === "lost") setActionDone("rejected");
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
    try {
      const res = await fetch(`/api/quotation/${quotation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.ok) {
        if (action === "approve") setActionDone("approved");
        else if (action === "reject") setActionDone("rejected");
        else setActionDone("review");
        setQuotation((prev) => prev ? { ...prev, status: data.status } : prev);
      }
    } catch {
      setError("Failed to update. Please try again.");
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
  const items = measured.map((m) => ({
    ...m,
    qty: Math.round(measuredLineSqft(m) * 100) / 100,
    amount: measuredLineTotal(m),
  }));
  const { netTotal, gstAmount, grandTotal } = totals;

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

          {/* Measured Items */}
          {items.length > 0 && (
            <section className="invoice-section">
              <h3 className="section-title">Measured Items</h3>
              <div className="table-wrapper">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th className="col-center">Size (W×H)</th>
                      <th className="col-center">Qty</th>
                      <th className="col-center">SFT</th>
                      <th className="col-center">Rate</th>
                      <th className="col-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i}>
                        <td className="highlight">{item.code || "-"}</td>
                        <td>{item.description} {item.glass && <span style={{opacity: 0.7}}><br/>({item.glass})</span>}</td>
                        <td className="col-center">{item.width && item.height ? `${item.width}×${item.height}` : "-"}</td>
                        <td className="col-center">{item.units}</td>
                        <td className="col-center">{item.qty}</td>
                        <td className="col-center">₹{item.rate}</td>
                        <td className="col-right amount">₹{item.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Unmeasured Items */}
          {unmeasured.length > 0 && (
            <section className="invoice-section">
              <h3 className="section-title">Unmeasured Items</h3>
              <div className="table-wrapper">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="col-center">Qty</th>
                      <th className="col-center">Rate</th>
                      <th className="col-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmeasured.map((item, i) => (
                      <tr key={i}>
                        <td className="highlight">{item.description}</td>
                        <td className="col-center">{item.units}</td>
                        <td className="col-center">₹{item.rate}</td>
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
                <span>Subtotal</span>
                <span>₹{totals.subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              {totals.transport > 0 && (
                <div className="total-row">
                  <span>Transport</span>
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
