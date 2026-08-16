"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Info } from "lucide-react";

interface ConversionResult {
  rf: number;
  sf: number;
  widthFt: number;
  widthMm: number;
}

export default function RFSFConverter() {
  const [inputValue, setInputValue] = useState("");
  const [widthValue, setWidthValue] = useState("");
  const [direction, setDirection] = useState<"rf-to-sf" | "sf-to-rf">("rf-to-sf");
  const [widthUnit, setWidthUnit] = useState<"ft" | "mm">("ft");
  const [result, setResult] = useState<ConversionResult | null>(null);

  const calculate = useCallback(() => {
    const val = parseFloat(inputValue);
    const w = parseFloat(widthValue);

    if (isNaN(val) || val <= 0) return;
    if (isNaN(w) || w <= 0) return;

    // Convert width to feet
    const widthFt = widthUnit === "mm" ? w * 0.00328084 : w;
    const widthMm = widthUnit === "mm" ? w : w * 304.8;

    let rf: number;
    let sf: number;

    if (direction === "rf-to-sf") {
      // RF to SF: multiply by width
      rf = val;
      sf = val * widthFt;
    } else {
      // SF to RF: divide by width
      sf = val;
      rf = val / widthFt;
    }

    setResult({ rf, sf, widthFt, widthMm });
  }, [inputValue, widthValue, direction, widthUnit]);

  const reset = () => {
    setInputValue("");
    setWidthValue("");
    setResult(null);
  };

  const formatNum = (n: number, d = 3) => n.toFixed(d);

  return (
    <div className="tool-page container">
      <Link href="/tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Tools
      </Link>

      <div className="tool-page-header">
        <div className="tool-icon">📐</div>
        <h1>RF ↔ SF Converter</h1>
        <p>Convert Running Feet (RF) to Square Feet (SF) for uPVC profiles, aluminum sections, and linear materials.</p>
      </div>

      <div className="ad-banner ad-top" aria-label="Advertisement">
        <span className="ad-label">Advertisement</span>
      </div>

      <div className="calc-card">
        <div className="calc-card-header">
          <h2>RF ↔ SF Conversion</h2>
        </div>
        <div className="calc-card-body">
          <div className="info-box blue">
            <strong>Formula:</strong> SF = RF × Width (ft). RF = SF ÷ Width (ft). You must know the profile width to convert accurately.
          </div>

          {/* Direction toggle */}
          <div className="form-group">
            <label>Conversion Direction</label>
            <div className="btn-group" style={{ gap: 0 }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: direction === "rf-to-sf" ? "var(--primary)" : "var(--bg)",
                  color: direction === "rf-to-sf" ? "white" : "var(--text)",
                  borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                  border: "1.5px solid var(--border)",
                  borderRight: "none",
                  fontSize: 13,
                }}
                onClick={() => setDirection("rf-to-sf")}
              >
                RF → SF
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: direction === "sf-to-rf" ? "var(--primary)" : "var(--bg)",
                  color: direction === "sf-to-rf" ? "white" : "var(--text)",
                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  border: "1.5px solid var(--border)",
                  fontSize: 13,
                }}
                onClick={() => setDirection("sf-to-rf")}
              >
                SF → RF
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="inputVal">
              {direction === "rf-to-sf" ? "Running Feet (RF)" : "Square Feet (SF)"}
            </label>
            <div className="input-wrap">
              <input
                id="inputVal"
                type="number"
                inputMode="decimal"
                placeholder={direction === "rf-to-sf" ? "e.g. 100" : "e.g. 50"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="has-unit"
              />
              <span className="unit">{direction === "rf-to-sf" ? "RF" : "SF"}</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="widthVal">Profile / Material Width</label>
            <div className="input-wrap">
              <input
                id="widthVal"
                type="number"
                inputMode="decimal"
                placeholder={widthUnit === "ft" ? "e.g. 2.5" : "e.g. 76"}
                value={widthValue}
                onChange={(e) => setWidthValue(e.target.value)}
                className="has-unit"
              />
              <span className="unit">{widthUnit === "ft" ? "ft" : "mm"}</span>
            </div>
            <div className="btn-group" style={{ marginTop: 8, gap: 6 }}>
              <button
                className="btn btn-sm"
                style={{
                  background: widthUnit === "ft" ? "var(--primary)" : "var(--bg)",
                  color: widthUnit === "ft" ? "white" : "var(--text)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  padding: "6px 12px",
                }}
                onClick={() => setWidthUnit("ft")}
              >
                Feet
              </button>
              <button
                className="btn btn-sm"
                style={{
                  background: widthUnit === "mm" ? "var(--primary)" : "var(--bg)",
                  color: widthUnit === "mm" ? "white" : "var(--text)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  padding: "6px 12px",
                }}
                onClick={() => setWidthUnit("mm")}
              >
                mm
              </button>
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary btn-block" onClick={calculate}>
              Convert
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          {result && (
            <div className="result-section">
              <h3>Conversion Result</h3>
              <div className="result-row">
                <span className="label">Input</span>
                <span className="value">{formatNum(parseFloat(inputValue))} {direction === "rf-to-sf" ? "RF" : "SF"}</span>
              </div>
              <div className="result-row">
                <span className="label">Profile Width</span>
                <span className="value">{formatNum(result.widthFt)} ft ({formatNum(result.widthMm, 0)} mm)</span>
              </div>
              <div className="result-row highlight">
                <span className="label">{direction === "rf-to-sf" ? "Square Feet" : "Running Feet"}</span>
                <span className="value">{formatNum(direction === "rf-to-sf" ? result.sf : result.rf)} {direction === "rf-to-sf" ? "SF" : "RF"}</span>
              </div>
              <div className="result-row">
                <span className="label">{direction === "rf-to-sf" ? "Running Feet" : "Square Feet"}</span>
                <span className="value">{formatNum(direction === "rf-to-sf" ? result.rf : result.sf)} {direction === "rf-to-sf" ? "RF" : "SF"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reference */}
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
            Common uPVC Profile Widths
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {[
              { name: "2-Track Frame", width: "60 mm" },
              { name: "3-Track Frame", width: "108 mm" },
              { name: "Casement Frame", width: "60 mm" },
              { name: "Slider Frame", width: "76 mm" },
              { name: "Shutter Profile", width: "40 mm" },
              { name: "Beading", width: "20 mm" },
            ].map((item) => (
              <div
                key={item.name}
                style={{
                  background: "var(--bg)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{item.width}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="pricing-cta">
        <h3>Never Convert Manually Again</h3>
        <p>
          Vitharn ERP auto-converts RF ↔ SF based on your product catalog. Enter
          dimensions once — get accurate SFT, RF, and pricing instantly on every
          quotation.
        </p>
        <a href="/upvc/pricing" className="btn-white">
          See Pricing Plans →
        </a>
      </div>
    </div>
  );
}
