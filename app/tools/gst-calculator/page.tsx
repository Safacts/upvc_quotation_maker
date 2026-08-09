"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Info } from "lucide-react";

const GST_RATES = [5, 12, 18, 28];

interface GstResult {
  originalAmount: number;
  gstAmount: number;
  totalAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  rate: number;
}

export default function GSTCalculator() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("18");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [gstType, setGstType] = useState<"igst" | "cgst-sgst">("cgst-sgst");
  const [result, setResult] = useState<GstResult | null>(null);

  const calculate = useCallback(() => {
    const amt = parseFloat(amount);
    const r = parseFloat(rate);

    if (isNaN(amt) || isNaN(r) || amt <= 0 || r <= 0) return;

    let gstAmount: number;
    let totalAmount: number;
    let originalAmount: number;

    if (mode === "add") {
      // Add GST to base amount
      originalAmount = amt;
      gstAmount = amt * (r / 100);
      totalAmount = amt + gstAmount;
    } else {
      // Remove GST from GST-inclusive amount
      totalAmount = amt;
      originalAmount = amt / (1 + r / 100);
      gstAmount = amt - originalAmount;
    }

    const half = gstAmount / 2;

    setResult({
      originalAmount,
      gstAmount,
      totalAmount,
      cgst: gstType === "cgst-sgst" ? half : 0,
      sgst: gstType === "cgst-sgst" ? half : 0,
      igst: gstType === "igst" ? gstAmount : 0,
      rate: r,
    });
  }, [amount, rate, mode, gstType]);

  const reset = () => {
    setAmount("");
    setRate("18");
    setMode("add");
    setResult(null);
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <div className="tool-page container">
      <Link href="/tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Tools
      </Link>

      <div className="tool-page-header">
        <div className="tool-icon">🧾</div>
        <h1>GST Calculator</h1>
        <p>Add or remove GST from any amount. Supports 5%, 12%, 18%, and 28% rates with CGST/SGST split.</p>
      </div>

      <div className="ad-banner ad-top" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
      </div>

      <div className="calc-card">
        <div className="calc-card-header">
          <h2>GST Calculation</h2>
        </div>
        <div className="calc-card-body">
          <div className="info-box blue">
            <strong>Two modes:</strong> &quot;Add GST&quot; calculates tax on base price. &quot;Remove GST&quot; extracts tax from a GST-inclusive price.
          </div>

          {/* Mode toggle */}
          <div className="form-group">
            <label>Calculation Mode</label>
            <div className="btn-group" style={{ gap: 0 }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: mode === "add" ? "var(--primary)" : "var(--bg)",
                  color: mode === "add" ? "white" : "var(--text)",
                  borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                  border: "1.5px solid var(--border)",
                  borderRight: "none",
                }}
                onClick={() => setMode("add")}
              >
                Add GST
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: mode === "remove" ? "var(--primary)" : "var(--bg)",
                  color: mode === "remove" ? "white" : "var(--text)",
                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  border: "1.5px solid var(--border)",
                }}
                onClick={() => setMode("remove")}
              >
                Remove GST
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="amount">
              {mode === "add" ? "Base Amount (excl. GST)" : "Total Amount (incl. GST)"}
            </label>
            <div className="input-wrap">
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="has-unit"
              />
              <span className="unit">₹</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="rate">GST Rate</label>
            <div className="input-wrap">
              <select
                id="rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", border: "1.5px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 15, outline: "none", background: "white" }}
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
          </div>

          {/* GST type */}
          <div className="form-group">
            <label>GST Type</label>
            <div className="btn-group" style={{ gap: 0 }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: gstType === "cgst-sgst" ? "var(--primary)" : "var(--bg)",
                  color: gstType === "cgst-sgst" ? "white" : "var(--text)",
                  borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                  border: "1.5px solid var(--border)",
                  borderRight: "none",
                  fontSize: 13,
                }}
                onClick={() => setGstType("cgst-sgst")}
              >
                CGST + SGST
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: gstType === "igst" ? "var(--primary)" : "var(--bg)",
                  color: gstType === "igst" ? "white" : "var(--text)",
                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  border: "1.5px solid var(--border)",
                  fontSize: 13,
                }}
                onClick={() => setGstType("igst")}
              >
                IGST
              </button>
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary btn-block" onClick={calculate}>
              Calculate GST
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          {result && (
            <div className="result-section">
              <h3>GST Breakdown</h3>
              <div className="result-row">
                <span className="label">{mode === "add" ? "Base Amount" : "Original (excl. GST)"}</span>
                <span className="value">{formatPrice(result.originalAmount)}</span>
              </div>
              <div className="result-row">
                <span className="label">GST @ {result.rate}%</span>
                <span className="value">{formatPrice(result.gstAmount)}</span>
              </div>
              {gstType === "cgst-sgst" ? (
                <>
                  <div className="result-row">
                    <span className="label">CGST ({(result.rate / 2).toFixed(1)}%)</span>
                    <span className="value">{formatPrice(result.cgst)}</span>
                  </div>
                  <div className="result-row">
                    <span className="label">SGST ({(result.rate / 2).toFixed(1)}%)</span>
                    <span className="value">{formatPrice(result.sgst)}</span>
                  </div>
                </>
              ) : (
                <div className="result-row">
                  <span className="label">IGST ({result.rate}%)</span>
                  <span className="value">{formatPrice(result.igst)}</span>
                </div>
              )}
              <div className="result-row highlight">
                <span className="label">{mode === "add" ? "Total (incl. GST)" : "Total Amount"}</span>
                <span className="value">{formatPrice(result.totalAmount)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GST Rate Reference */}
      <div style={{ maxWidth: 600, margin: "32px auto 0" }}>
        <div
          style={{
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "24px",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
            <Info size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
            GST Rate Reference (India)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            {[
              { rate: "5%", items: "Essential goods, packaged food" },
              { rate: "12%", items: "Computers, processed food" },
              { rate: "18%", items: "Most services, uPVC, electronics" },
              { rate: "28%", items: "Luxury cars, AC, cement" },
            ].map((item) => (
              <div
                key={item.rate}
                style={{
                  background: "var(--bg)",
                  borderRadius: "var(--radius-sm)",
                  padding: "14px 12px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>{item.rate}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{item.items}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-light)", marginTop: 14 }}>
            Note: uPVC windows and doors typically fall under 18% GST (HSN Code 3925). Always consult your CA for your specific product.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="pricing-cta">
        <h3>Auto-GST on Every Invoice</h3>
        <p>
          Vitharn ERP applies the correct GST rate to every line item,
          auto-generates GST-compliant invoices, and prepares GSTR-ready
          reports. No manual math.
        </p>
        <a href="/#pricing" className="btn-white">
          See Pricing Plans →
        </a>
      </div>
    </div>
  );
}
