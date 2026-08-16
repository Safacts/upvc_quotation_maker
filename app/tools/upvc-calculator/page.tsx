"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Info } from "lucide-react";

interface WindowResult {
  sft: number;
  runningFeet: number;
  totalPrice: number;
  perimeterMm: number;
}

export default function UPVCCalculator() {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [pricePerSft, setPricePerSft] = useState("");
  const [result, setResult] = useState<WindowResult | null>(null);

  const calculate = useCallback(() => {
    const w = parseFloat(width);
    const h = parseFloat(height);
    const qty = parseInt(quantity) || 1;
    const rate = parseFloat(pricePerSft);

    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    // Convert mm to feet: 1 mm = 0.00328084 ft
    const wFt = w * 0.00328084;
    const hFt = h * 0.00328084;

    // Square feet = width(ft) × height(ft)
    const sft = wFt * hFt;

    // Running feet (perimeter) = 2 × (w + h) in feet
    const perimeterMm = 2 * (w + h);
    const runningFeet = perimeterMm * 0.00328084;

    // Total price
    const totalPrice = !isNaN(rate) && rate > 0 ? sft * qty * rate : 0;

    setResult({ sft, runningFeet, totalPrice, perimeterMm });
  }, [width, height, quantity, pricePerSft]);

  const reset = () => {
    setWidth("");
    setHeight("");
    setQuantity("1");
    setPricePerSft("");
    setResult(null);
  };

  const formatNum = (n: number, d = 2) => n.toFixed(d);
  const formatPrice = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="tool-page container">
      {/* Back link */}
      <Link href="/tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Tools
      </Link>

      <div className="tool-page-header">
        <div className="tool-icon">🪟</div>
        <h1>uPVC Window Price Calculator</h1>
        <p>Enter window dimensions in mm to get SFT area, running feet, and estimated price.</p>
      </div>

      {/* Ad top */}
      <div className="ad-banner ad-top" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
      </div>

      <div className="calc-card">
        <div className="calc-card-header">
          <h2>Window Dimensions</h2>
        </div>
        <div className="calc-card-body">
          <div className="info-box blue">
            <strong>How it works:</strong> Enter width &amp; height in millimeters. The calculator converts to square feet (SFT) using the standard formula — then multiplies by your rate per SFT for the final price.
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="width">Width <span className="hint">(mm)</span></label>
              <div className="input-wrap">
                <input
                  id="width"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 1200"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="has-unit"
                />
                <span className="unit">mm</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="height">Height <span className="hint">(mm)</span></label>
              <div className="input-wrap">
                <input
                  id="height"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 1500"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="has-unit"
                />
                <span className="unit">mm</span>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="qty">Quantity</label>
              <div className="input-wrap">
                <input
                  id="qty"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="rate">Rate per SFT <span className="hint">(₹, optional)</span></label>
              <div className="input-wrap">
                <input
                  id="rate"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 350"
                  value={pricePerSft}
                  onChange={(e) => setPricePerSft(e.target.value)}
                  className="has-unit"
                />
                <span className="unit">₹</span>
              </div>
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary btn-block" onClick={calculate}>
              Calculate Price
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          {result && (
            <div className="result-section">
              <h3>Calculation Results</h3>
              <div className="result-row">
                <span className="label">Width × Height</span>
                <span className="value">{width} × {height} mm</span>
              </div>
              <div className="result-row">
                <span className="label">Area (SFT)</span>
                <span className="value">{formatNum(result.sft)} sq ft</span>
              </div>
              <div className="result-row">
                <span className="label">Running Feet (RF)</span>
                <span className="value">{formatNum(result.runningFeet)} ft</span>
              </div>
              <div className="result-row">
                <span className="label">Perimeter</span>
                <span className="value">{formatNum(result.perimeterMm, 0)} mm</span>
              </div>
              <div className="result-row">
                <span className="label">Quantity</span>
                <span className="value">{quantity} pcs</span>
              </div>
              <div className="result-row">
                <span className="label">Total Area</span>
                <span className="value">{formatNum(result.sft * (parseInt(quantity) || 1))} sq ft</span>
              </div>
              {result.totalPrice > 0 && (
                <div className="result-row highlight">
                  <span className="label">Estimated Total</span>
                  <span className="value">{formatPrice(result.totalPrice)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reference table */}
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
            Common uPVC Window Sizes (SFT reference)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Size (mm)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>SFT</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>RF</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["600 × 600", "3.87", "7.87"],
                  ["900 × 900", "8.72", "11.81"],
                  ["1200 × 1200", "15.50", "15.75"],
                  ["1200 × 1500", "19.38", "17.72"],
                  ["1500 × 1500", "24.22", "19.69"],
                  ["1800 × 1500", "29.06", "21.65"],
                ].map(([size, sft, rf]) => (
                  <tr key={size as string} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>{size}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>{sft}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>{rf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="pricing-cta">
        <h3>Automate Your uPVC Quotations</h3>
        <p>
          Vitharn ERP generates branded PDF quotations with SFT, RF, GST, and
          your company logo — in under 30 seconds. Cloud-synced across phone and
          web.
        </p>
        <a href="/upvc/pricing" className="btn-white">
          See Pricing Plans →
        </a>
      </div>
    </div>
  );
}
