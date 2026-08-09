"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Info } from "lucide-react";

interface GlassResult {
  weightKg: number;
  weightLbs: number;
  areaSqm: number;
  areaSft: number;
}

// Glass density in kg/m³ (standard float glass = 2500 kg/m³)
const GLASS_DENSITY_KG_PER_M3 = 2500;

export default function GlassWeightCalculator() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [thickness, setThickness] = useState("");
  const [unit, setUnit] = useState<"mm">("mm");
  const [result, setResult] = useState<GlassResult | null>(null);

  const calculate = useCallback(() => {
    const l = parseFloat(length);
    const w = parseFloat(width);
    const t = parseFloat(thickness);

    if (isNaN(l) || isNaN(w) || isNaN(t) || l <= 0 || w <= 0 || t <= 0) return;

    // Convert all to meters for volume calculation
    const toMeters = (val: number) => {
      switch (unit) {
        case "mm": return val / 1000;
        default: return val / 1000;
      }
    };

    const lM = toMeters(l);
    const wM = toMeters(w);
    const tM = toMeters(t);

    // Volume in m³
    const volumeM3 = lM * wM * tM;

    // Weight = Volume × Density
    const weightKg = volumeM3 * GLASS_DENSITY_KG_PER_M3;
    const weightLbs = weightKg * 2.20462;

    // Area
    const areaSqm = lM * wM;
    const areaSft = areaSqm * 10.7639;

    setResult({ weightKg, weightLbs, areaSqm, areaSft });
  }, [length, width, thickness, unit]);

  const reset = () => {
    setLength("");
    setWidth("");
    setThickness("");
    setResult(null);
  };

  const formatNum = (n: number, d = 2) =>
    n < 0.01 ? n.toExponential(2) : n.toFixed(d);

  return (
    <div className="tool-page container">
      <Link href="/tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Tools
      </Link>

      <div className="tool-page-header">
        <div className="tool-icon">🔲</div>
        <h1>Glass Weight Calculator</h1>
        <p>Enter glass panel dimensions and thickness to calculate exact weight in kg or lbs.</p>
      </div>

      <div className="ad-banner ad-top" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
      </div>

      <div className="calc-card">
        <div className="calc-card-header">
          <h2>Glass Panel Dimensions</h2>
        </div>
        <div className="calc-card-body">
          <div className="info-box blue">
            <strong>Formula:</strong> Weight = Length × Width × Thickness × Glass Density (2500 kg/m³). Uses standard float glass density. Laminated or tempered glass uses the same base density.
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="length">Length <span className="hint">(mm)</span></label>
              <div className="input-wrap">
                <input
                  id="length"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 2400"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="has-unit"
                />
                <span className="unit">mm</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="width">Width <span className="hint">(mm)</span></label>
              <div className="input-wrap">
                <input
                  id="width"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 1800"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="has-unit"
                />
                <span className="unit">mm</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="thickness">Glass Thickness <span className="hint">(mm)</span></label>
            <div className="input-wrap">
              <input
                id="thickness"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 5"
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                className="has-unit"
              />
              <span className="unit">mm</span>
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary btn-block" onClick={calculate}>
              Calculate Weight
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          {result && (
            <div className="result-section">
              <h3>Weight Results</h3>
              <div className="result-row">
                <span className="label">Panel Size</span>
                <span className="value">{length} × {width} mm</span>
              </div>
              <div className="result-row">
                <span className="label">Thickness</span>
                <span className="value">{thickness} mm</span>
              </div>
              <div className="result-row">
                <span className="label">Area</span>
                <span className="value">{formatNum(result.areaSqm)} m² ({formatNum(result.areaSft)} sq ft)</span>
              </div>
              <div className="result-row highlight">
                <span className="label">Weight</span>
                <span className="value">{formatNum(result.weightKg)} kg</span>
              </div>
              <div className="result-row">
                <span className="label">Weight (lbs)</span>
                <span className="value">{formatNum(result.weightLbs)} lbs</span>
              </div>
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
            Quick Reference: 5mm Glass Weight
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Size (mm)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>Area (m²)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["600 × 600", "0.36", "4.50"],
                  ["900 × 900", "0.81", "10.13"],
                  ["1200 × 1200", "1.44", "18.00"],
                  ["1200 × 1500", "1.80", "22.50"],
                  ["1800 × 2400", "4.32", "54.00"],
                  ["2400 × 3000", "7.20", "90.00"],
                ].map(([size, area, weight]) => (
                  <tr key={size as string} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>{size}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>{area}</td>
                    <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>{weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-light)", marginTop: 12 }}>
            * Based on 5mm clear float glass @ 2500 kg/m³. For other thicknesses, multiply weight proportionally.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="pricing-cta">
        <h3>Track Glass Inventory Automatically</h3>
        <p>
          Vitharn ERP stores your product catalog with weights, dimensions, and
          pricing. Generate quotations that auto-calculate everything — glass,
          hardware, labour, GST.
        </p>
        <a href="/#pricing" className="btn-white">
          See Pricing Plans →
        </a>
      </div>
    </div>
  );
}
