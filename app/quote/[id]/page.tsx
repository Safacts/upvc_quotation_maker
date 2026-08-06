"use client";

import "./quote.css";
import { useCallback, useEffect, useState } from "react";
import { Check, Edit3, X, CheckCircle2, XCircle, FileWarning, ShieldAlert } from "lucide-react";
import { parseClientConfig } from "@/lib/types";

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

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [measured, setMeasured] = useState<Item[]>([]);
  const [unmeasured, setUnmeasured] = useState<Item[]>([]);
  const [clientConfig, setClientConfig] = useState<ClientConfig>({});
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const items = measured.map((m) => {
    const qty = (m.width || 0) * (m.height || 0) * (m.units || 1) / 144;
    return { ...m, qty: Math.round(qty * 100) / 100, amount: Math.round(qty * m.rate) };
  });
  const measuredTotal = items.reduce((s, i) => s + i.amount, 0);
  const unmeasuredTotal = unmeasured.reduce((s, i) => s + (i.units * i.rate), 0);
  const subtotal = measuredTotal + unmeasuredTotal + (quotation.transport_cost || 0);
  const gstAmount = quotation.include_gst ? subtotal * (quotation.gst_percentage || 0) / 100 : 0;
  const grandTotal = subtotal + gstAmount;

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
                <span>₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              {quotation.include_gst && quotation.gst_percentage > 0 && (
                <div className="total-row">
                  <span>GST ({quotation.gst_percentage}%)</span>
                  <span>₹{gstAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              {quotation.transport_cost > 0 && (
                <div className="total-row">
                  <span>Transport</span>
                  <span>₹{quotation.transport_cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
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
        </div>
      </div>
      
      <footer className="invoice-footer">
        Generated securely via Vitharn UPVC Quotation System
      </footer>

    </div>
  );
}
