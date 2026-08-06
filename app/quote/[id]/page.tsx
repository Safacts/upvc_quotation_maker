"use client";

import { useCallback, useEffect, useState } from "react";

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
      setClientConfig(data.clientConfig || {});
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#64748b" }}>Loading quotation...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ background: "white", padding: 40, borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>Access Denied</h2>
          <p style={{ color: "#64748b" }}>{error}</p>
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ background: "white", padding: 48, borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{isApproved ? "✅" : isRejected ? "❌" : "📝"}</div>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>
            {isApproved ? "Quotation Approved!" : isRejected ? "Quotation Rejected" : "Review Requested"}
          </h2>
          <p style={{ color: "#64748b", marginBottom: 24 }}>
            {isApproved
              ? "Thank you! Your confirmation has been recorded. We will contact you shortly to begin work."
              : isRejected
              ? "Your response has been recorded. Feel free to reach out if you have questions."
              : "Your request for changes has been noted. The business will review and get back to you."}
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Quote: {quotation.quote_no}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 16px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "white", borderRadius: 16, padding: "32px 24px", marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              {clientConfig.logoUrl && <img src={clientConfig.logoUrl} alt="Logo" style={{ maxHeight: 60, marginBottom: 12 }} />}
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{clientConfig.companyName || "Quotation"}</h1>
              {clientConfig.companyProprietor && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Prop: {clientConfig.companyProprietor}</p>}
              {clientConfig.companyAddress && <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>{clientConfig.companyAddress}</p>}
              {clientConfig.companyContact && <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>📞 {clientConfig.companyContact}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#6366f1" }}>QUOTATION</h2>
              <p style={{ margin: "8px 0 0", fontWeight: 600, color: "#0f172a" }}>{quotation.quote_no}</p>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Date: {new Date(quotation.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>To: {quotation.customer_name}</p>
            {quotation.address && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{quotation.address}</p>}
            {quotation.contact_no && <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>📞 {quotation.contact_no}</p>}
            {quotation.reference && <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Ref: {quotation.reference}</p>}
          </div>
        </div>

        {/* Measured Items */}
        {items.length > 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Measured Items</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 6px", textAlign: "left", color: "#64748b" }}>Code</th>
                  <th style={{ padding: "8px 6px", textAlign: "left", color: "#64748b" }}>Description</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>Size (W×H)</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>Qty</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>SFT</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>Rate</th>
                  <th style={{ padding: "8px 6px", textAlign: "right", color: "#64748b" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px" }}>{item.code || "-"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.description} {item.glass && <span style={{ color: "#94a3b8" }}>({item.glass})</span>}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{item.width && item.height ? `${item.width}×${item.height}` : "-"}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{item.units}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{item.qty}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>₹{item.rate}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>₹{item.amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Unmeasured Items */}
        {unmeasured.length > 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Unmeasured Items</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 6px", textAlign: "left", color: "#64748b" }}>Description</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>Qty</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#64748b" }}>Rate</th>
                  <th style={{ padding: "8px 6px", textAlign: "right", color: "#64748b" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {unmeasured.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px" }}>{item.description}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{item.units}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>₹{item.rate}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>₹{(item.units * item.rate).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div style={{ background: "white", borderRadius: 16, padding: "24px", marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                <span style={{ color: "#64748b" }}>Subtotal</span>
                <span>₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              {quotation.include_gst && quotation.gst_percentage > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                  <span style={{ color: "#64748b" }}>GST ({quotation.gst_percentage}%)</span>
                  <span>₹{gstAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", borderTop: "2px solid #e2e8f0", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                <span>Grand Total</span>
                <span>₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ background: "white", borderRadius: 16, padding: "32px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", textAlign: "center" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Confirm This Quotation</h3>
          <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 14 }}>Please review the details above and confirm your decision.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => handleAction("approve")}
              disabled={submitting}
              style={{
                padding: "14px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: "#16a34a", color: "white", fontWeight: 700, fontSize: 15,
                boxShadow: "0 4px 14px rgba(22,163,74,0.3)", opacity: submitting ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => handleAction("review")}
              disabled={submitting}
              style={{
                padding: "14px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: "#f59e0b", color: "white", fontWeight: 700, fontSize: 15,
                boxShadow: "0 4px 14px rgba(245,158,11,0.3)", opacity: submitting ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              📝 Request Changes
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={submitting}
              style={{
                padding: "14px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: "#dc2626", color: "white", fontWeight: 700, fontSize: 15,
                boxShadow: "0 4px 14px rgba(220,38,38,0.3)", opacity: submitting ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              ❌ Reject
            </button>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Your response will be shared with {clientConfig.companyName || "the business"} immediately.
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
          Powered by vitharn upvc • Questions? Contact {clientConfig.companyEmail || clientConfig.companyContact || "the business"}
        </p>
      </div>
    </div>
  );
}
