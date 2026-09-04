"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Printer,
  FileText,
  Layers,
  Scissors,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatMoney, formatSqft } from "@/lib/console-format";
import {
  buildBom,
  optimizeCuts,
  STOCK_BAR_MM,
  type WindowConfig,
  type WindowType,
} from "@/lib/bom-engine";
import { WindowElevationSvg } from "@/lib/window-elevation";

const TYPES: Array<{ v: WindowType; label: string; elevationDesc: string }> = [
  { v: "fixed", label: "Fixed Window", elevationDesc: "Fixed Window" },
  { v: "casement_single", label: "Casement 1-sash", elevationDesc: "Casement 1-sash Window" },
  { v: "casement_double", label: "Casement 2-sash", elevationDesc: "Casement 2-sash Window" },
  { v: "casement_fixed_combo", label: "Fixed + Casement", elevationDesc: "Fixed Casement Window" },
  { v: "sliding_2track_2panel", label: "Sliding 2T-2P", elevationDesc: "Sliding 2 Track 2 Panel" },
  { v: "sliding_2track_3panel", label: "Sliding 2T-3P", elevationDesc: "Sliding 2 Track 3 Panel" },
  { v: "sliding_3track", label: "Sliding 3T", elevationDesc: "Sliding 3 Track Window" },
  { v: "french", label: "French Door", elevationDesc: "French Double Door" },
  { v: "ventilator", label: "Ventilator", elevationDesc: "Ventilator Exhaust" },
];

export default function BuilderClient() {
  const { toast } = useConsole();
  const [cfg, setCfg] = useState<WindowConfig>({
    type: "casement_double",
    width: 1800,
    height: 1400,
    system: "60mm",
    glassSpec: "5-12-5",
    ratePerSqft: 520,
    hardwareTier: "standard",
  });
  const [qty, setQty] = useState(2);
  const [offcuts, setOffcuts] = useState<string>("");
  const [rateOptions, setRateOptions] = useState<Array<{ name: string; price: number }>>([]);
  const [activeTab, setActiveTab] = useState<"bom" | "glass" | "cuts">("bom");

  useEffect(() => {
    fetch("/api/console/products?page_size=50", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        const rows = Array.isArray(j?.rows) ? j.rows : Array.isArray(j) ? j : [];
        setRateOptions(
          rows
            .map((x: any) => ({ name: x.name, price: Number(x.price) || 0 }))
            .filter((x: any) => x.price > 0)
            .slice(0, 8),
        );
      })
      .catch(() => {});
  }, []);

  const currentType = useMemo(
    () => TYPES.find((t) => t.v === cfg.type) || TYPES[2],
    [cfg.type],
  );

  const bom = useMemo(() => buildBom(cfg), [cfg]);
  const offcutNums = useMemo(
    () =>
      offcuts
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    [offcuts],
  );
  const scaledCuts = useMemo(
    () => bom.cuts.map((c) => ({ ...c, qty: c.qty * qty })),
    [bom.cuts, qty],
  );
  const opt = useMemo(
    () => optimizeCuts(scaledCuts, STOCK_BAR_MM, offcutNums),
    [scaledCuts, offcutNums],
  );

  const barCost = 2850; // Rs per 6m bar
  const barsCost = opt.barsUsed * barCost;
  const wasteRs = (opt.wastePct / 100) * barsCost;
  const savedBars = offcutNums.length ? opt.offcutReuse : 0;
  const marginGuard =
    (cfg.ratePerSqft ?? 0) < 420
      ? "Loss risk — rate below Rs. 420/sft"
      : (cfg.ratePerSqft ?? 0) < 480
        ? "Thin margin — consider Rs. 520+"
        : "Margin OK";

  // Connect to Console status bar
  useConsoleStatus({
    count: `${currentType.label} • ${cfg.width} × ${cfg.height} mm`,
    total: `${formatMoney(bom.price.total * qty)} (${qty} nos)`,
    hints: [
      { keys: "Ctrl+P", label: "Print Saw Sheet" },
      { keys: "Alt+A", label: "Add to Draft" },
    ],
  });

  async function addToQuote() {
    if (!cfg.width || cfg.width < 300 || !cfg.height || cfg.height < 300) {
      toast("Please enter valid window dimensions (min 300 mm)", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          customer_name: "Walk-in (Window Builder)",
          contact_no: "",
          address: "",
          measured_items: [
            {
              width: cfg.width,
              height: cfg.height,
              units: qty,
              rate: cfg.ratePerSqft ?? 520,
              description: `${currentType.label} ${cfg.width}×${cfg.height} mm (${cfg.glassSpec || "5mm"})`,
              glass: cfg.glassSpec || "5mm",
            },
          ],
          unmeasured_items: [
            {
              description:
                bom.lines
                  .filter((l) => l.kind === "hardware")
                  .map((l) => l.label)
                  .join(", ") || "Hardware & accessories",
              units: qty,
              rate: bom.price.hardware,
            },
          ],
          window_json: cfg,
          bom_json: bom,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Failed to create draft");
      toast(
        `Draft ${j?.quote_no || "created"} — ${formatMoney(bom.price.total * qty)}`,
        "ok",
      );
    } catch (e: any) {
      toast(e.message, "err");
    }
  }

  function printSawSheet() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = opt.bars
      .map(
        (b, i) =>
          `<tr><td>Bar ${i + 1}</td><td>${b.cuts.join(" + ") || scaledCuts.map((c) => c.lengthMm).slice(i * 2, (i + 1) * 2).join(" + ")}</td><td style="text-align:right">${b.offcut} mm offcut</td><td style="text-align:right">${b.wastePct.toFixed(1)}%</td></tr>`,
      )
      .join("");
    const labels = scaledCuts
      .map((c, i) => {
        const id = `W-${cfg.width}x${cfg.height}-${i + 1}`;
        const data = encodeURIComponent(id + " | " + c.lengthMm + "mm");
        return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${data}" width="80" height="80" /><div style="font-size:11px;margin-top:4px">${id}</div><div style="font-size:12px;font-weight:700">${c.lengthMm} mm × ${c.qty}</div></div>`;
      })
      .join("");
    w.document.write(
      `<html><head><title>Saw Sheet — ${currentType.label} ${cfg.width}×${cfg.height} mm (×${qty})</title><style>body{font-family:Inter,system-ui;padding:24px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #e5e7eb;padding:8px;font-size:13px} th{background:#f8fafc}</style></head><body><h2>Saw Sheet — ${currentType.label} ${cfg.width}×${cfg.height} mm × ${qty} nos</h2><p>Bars: ${opt.barsUsed} • Waste ${opt.wastePct.toFixed(1)}% • Stock ${STOCK_BAR_MM}mm • ${marginGuard}</p><table><thead><tr><th>Bar</th><th>Cuts</th><th>Offcut</th><th>Waste</th></tr></thead><tbody>${rows}</tbody></table><p>Glass: ${bom.glass.map((g) => `${g.qty * qty}× ${g.w}×${g.h} mm ${g.spec}`).join(", ")}</p><h3 style="margin-top:18px">Cutting Barcode Labels</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${labels}</div><script>window.print()</script></body></html>`,
    );
    w.document.close();
  }

  useConsoleAction("save", addToQuote);
  useConsoleAction("export", printSawSheet);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
      {/* LEFT: Window Configuration Card */}
      <div className="vc-card">
        <div className="vc-card-head">
          <span className="vc-card-title">
            <SlidersHorizontal size={13} /> Window Specifications
          </span>
          <span style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>IS 17953</span>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Dimensions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="vc-field">
              <label className="vc-label">
                Width (mm) <span className="vc-req">*</span>
              </label>
              <input
                type="number"
                className="vc-input vc-num"
                value={cfg.width || ""}
                min={300}
                max={6000}
                onChange={(e) =>
                  setCfg({ ...cfg, width: parseInt(e.target.value || "0", 10) })
                }
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">
                Height (mm) <span className="vc-req">*</span>
              </label>
              <input
                type="number"
                className="vc-input vc-num"
                value={cfg.height || ""}
                min={300}
                max={3000}
                onChange={(e) =>
                  setCfg({ ...cfg, height: parseInt(e.target.value || "0", 10) })
                }
              />
            </div>
          </div>

          {/* Window Type */}
          <div className="vc-field">
            <label className="vc-label">Window Profile & Opening</label>
            <select
              className="vc-select"
              value={cfg.type}
              onChange={(e) => setCfg({ ...cfg, type: e.target.value as WindowType })}
            >
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Glass Spec */}
          <div className="vc-field">
            <label className="vc-label">Glass Specification</label>
            <input
              className="vc-input"
              value={cfg.glassSpec || ""}
              onChange={(e) => setCfg({ ...cfg, glassSpec: e.target.value })}
              placeholder="e.g. 5-12-5 DGU, 6mm Toughened"
            />
          </div>

          {/* Rate shortcuts from Master */}
          {rateOptions.length > 0 && (
            <div className="vc-field">
              <label className="vc-label">Quick Rate Card</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {rateOptions.map((o) => {
                  const active = cfg.ratePerSqft === o.price;
                  return (
                    <button
                      key={o.name}
                      type="button"
                      onClick={() => setCfg({ ...cfg, ratePerSqft: o.price })}
                      className={`vc-btn vc-btn-sm ${active ? "vc-btn-primary" : ""}`}
                      style={{ fontSize: 10.5, height: 22, padding: "0 6px" }}
                    >
                      {o.name}: ₹{o.price}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rate & Qty */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="vc-field">
              <label className="vc-label">Rate / sq.ft (₹)</label>
              <input
                type="number"
                className="vc-input vc-num"
                value={cfg.ratePerSqft || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, ratePerSqft: parseFloat(e.target.value || "0") })
                }
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Quantity (Nos)</label>
              <input
                type="number"
                className="vc-input vc-num"
                value={qty}
                min={1}
                onChange={(e) =>
                  setQty(Math.max(1, parseInt(e.target.value || "1", 10)))
                }
              />
            </div>
          </div>

          {/* Insect Mesh Checkbox */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0" }}>
            <input
              type="checkbox"
              id="builder-mesh"
              checked={!!cfg.hasMesh}
              onChange={(e) => setCfg({ ...cfg, hasMesh: e.target.checked })}
            />
            <label
              htmlFor="builder-mesh"
              style={{ fontSize: 12, cursor: "pointer", color: "var(--vc-text)" }}
            >
              Include SS / Fiber Insect Mesh
            </label>
          </div>

          {/* Workshop Offcuts */}
          <div className="vc-field">
            <label className="vc-label">Workshop Offcuts to Reuse (mm)</label>
            <input
              className="vc-input"
              value={offcuts}
              onChange={(e) => setOffcuts(e.target.value)}
              placeholder="e.g. 1200, 850, 650"
            />
          </div>

          {/* Warnings */}
          {bom.warnings.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 9px",
                background: "var(--vc-yellow-dim, #fef9c3)",
                borderRadius: "var(--vc-radius)",
                color: "#854d0e",
                fontSize: 11,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>{bom.warnings.join(" • ")}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              style={{ justifyContent: "center", height: 32, fontSize: 12 }}
              onClick={addToQuote}
            >
              <FileText size={13} /> Add to Quotation Draft
            </button>
            <button
              type="button"
              className="vc-btn"
              style={{ justifyContent: "center", height: 28, fontSize: 11.5 }}
              onClick={printSawSheet}
            >
              <Printer size={13} /> Print Saw Sheet + QR Labels
            </button>
          </div>

          <div style={{ fontSize: 11, color: "var(--vc-text-dim)", lineHeight: 1.4, marginTop: 2 }}>
            Deductions tuned for 60/70mm IS 17953 profile family. One object computes BOM, cutting schedule, and cost.
          </div>
        </div>
      </div>

      {/* RIGHT: Live 2D CAD Elevation & Pricing / BOM Panes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top Summary & CAD Card */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">
              <Compass size={13} /> {currentType.label} — {cfg.width.toLocaleString("en-IN")} × {cfg.height.toLocaleString("en-IN")} mm
            </span>
            <span className="vc-pill vc-pill-sent">
              {qty} nos • {formatSqft(bom.sqft * qty)} sq.ft
            </span>
          </div>

          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
            {/* CAD Elevation Diagram Container */}
            <div
              style={{
                width: 280,
                minHeight: 220,
                background: "var(--vc-surface-2)",
                border: "1px solid var(--vc-border)",
                borderRadius: "var(--vc-radius)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 4px",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <WindowElevationSvg
                widthMm={cfg.width || 1000}
                heightMm={cfg.height || 1000}
                description={currentType.elevationDesc}
                targetWidth={260}
                targetHeight={Math.min(220, Math.max(160, Math.round(((cfg.height || 1000) / (cfg.width || 1000)) * 240)))}
                profileColorName={cfg.system || "White"}
              />
              <div style={{ fontSize: 10.5, color: "var(--vc-text-dim)", marginTop: 4 }}>
                {cfg.glassSpec || "5mm Standard"} {cfg.hasMesh ? "• With Insect Mesh" : ""}
              </div>
            </div>

            {/* Financial & Material Metrics */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* 3 Metric Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--vc-surface-2)", padding: "8px 10px", borderRadius: "var(--vc-radius)", border: "1px solid var(--vc-border)" }}>
                  <div style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>Material Cost</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{formatMoney(bom.price.material * qty)}</div>
                </div>
                <div style={{ background: "var(--vc-surface-2)", padding: "8px 10px", borderRadius: "var(--vc-radius)", border: "1px solid var(--vc-border)" }}>
                  <div style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>Hardware + Mesh</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{formatMoney(bom.price.hardware * qty)}</div>
                </div>
                <div style={{ background: "var(--vc-blue-dim, #eff6ff)", padding: "8px 10px", borderRadius: "var(--vc-radius)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <div style={{ fontSize: 11, color: "var(--vc-blue)" }}>Total Net Price</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--vc-blue)", marginTop: 2 }}>{formatMoney(bom.price.total * qty)}</div>
                </div>
              </div>

              {/* Cutting & Optimization Breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "8px 10px", background: "var(--vc-surface-2)", borderRadius: "var(--vc-radius)", border: "1px solid var(--vc-border)" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>6m Stock Bars</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{opt.barsUsed} nos</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>Cutting Waste</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: opt.wastePct > 18 ? "var(--vc-red)" : "var(--vc-green)" }}>
                    {opt.wastePct.toFixed(1)}% • {formatMoney(wasteRs)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>Offcut Optimization</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: savedBars ? "var(--vc-green)" : "inherit" }}>
                    {savedBars} bars saved {savedBars ? `(₹${(savedBars * barCost).toLocaleString("en-IN")})` : ""}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: "var(--vc-text-dim)" }}>
                Stock cost ~ {formatMoney(barsCost)} @ ₹{barCost.toLocaleString("en-IN")}/bar • Optimizer: offcut-first Best-Fit-Decreasing
              </div>

              {/* Margin Pill */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  className="vc-pill"
                  style={{
                    padding: "3px 8px",
                    background: marginGuard.includes("Loss") ? "var(--vc-red-dim)" : marginGuard.includes("Thin") ? "var(--vc-yellow-dim)" : "var(--vc-green-dim)",
                    color: marginGuard.includes("Loss") ? "var(--vc-red)" : marginGuard.includes("Thin") ? "#b45309" : "var(--vc-green)",
                  }}
                >
                  {marginGuard.includes("OK") ? <CheckCircle2 size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} /> : <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />}
                  {marginGuard}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Details Tabs Card: BOM, Glass Schedule, Cutting List */}
        <div className="vc-card">
          <div className="vc-card-head" style={{ padding: "4px 8px" }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className={`vc-btn vc-btn-sm ${activeTab === "bom" ? "vc-btn-primary" : ""}`}
                onClick={() => setActiveTab("bom")}
              >
                <Layers size={12} /> Bill of Materials (×{qty})
              </button>
              <button
                type="button"
                className={`vc-btn vc-btn-sm ${activeTab === "glass" ? "vc-btn-primary" : ""}`}
                onClick={() => setActiveTab("glass")}
              >
                Glass Schedule ({bom.glass.length})
              </button>
              <button
                type="button"
                className={`vc-btn vc-btn-sm ${activeTab === "cuts" ? "vc-btn-primary" : ""}`}
                onClick={() => setActiveTab("cuts")}
              >
                <Scissors size={12} /> Cut List ({scaledCuts.length})
              </button>
            </div>
            <span style={{ fontSize: 11, color: "var(--vc-text-dim)", marginLeft: "auto" }}>
              Total Area: {formatSqft(bom.sqft * qty)} sq.ft
            </span>
          </div>

          {/* TAB 1: BOM */}
          {activeTab === "bom" && (
            <div style={{ overflowX: "auto" }}>
              <table className="vc-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Profile Code</th>
                    <th className="vc-num">Cut Length</th>
                    <th className="vc-num">Qty (per unit)</th>
                    <th className="vc-num">Total Qty</th>
                    <th className="vc-num">Total Run</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.lines.map((l, i) => {
                    const unitQty = l.qty;
                    const totalQty = l.qty * (l.kind === "profile" ? qty : 1);
                    const totalRun = l.kind === "profile" ? (l.lengthMm * l.qty * qty) : 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{l.label}</td>
                        <td>
                          <span className="vc-pill" style={{ fontSize: 10, padding: "0 6px" }}>
                            {l.profileId}
                          </span>
                        </td>
                        <td className="vc-num">{l.lengthMm.toLocaleString("en-IN")} mm</td>
                        <td className="vc-num">{unitQty}</td>
                        <td className="vc-num" style={{ fontWeight: 600 }}>{totalQty}</td>
                        <td className="vc-num">
                          {l.kind === "profile"
                            ? `${(totalRun / 1000).toFixed(2)} m (${totalRun.toLocaleString("en-IN")} mm)`
                            : l.kind === "hardware"
                              ? `${totalQty} set`
                              : `${l.lengthMm} mm`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: Glass Schedule */}
          {activeTab === "glass" && (
            <div style={{ overflowX: "auto" }}>
              <table className="vc-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Glass Specification</th>
                    <th className="vc-num">Width (mm)</th>
                    <th className="vc-num">Height (mm)</th>
                    <th className="vc-num">Pieces per Window</th>
                    <th className="vc-num">Total Pieces (×{qty})</th>
                    <th className="vc-num">Total Area (sq.ft)</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.glass.map((g, i) => {
                    const pcs = g.qty * qty;
                    const sqftEach = (g.w / 304.8) * (g.h / 304.8);
                    const totalSqft = sqftEach * pcs;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{g.spec || cfg.glassSpec || "5mm Clear"}</td>
                        <td className="vc-num">{g.w.toLocaleString("en-IN")} mm</td>
                        <td className="vc-num">{g.h.toLocaleString("en-IN")} mm</td>
                        <td className="vc-num">{g.qty}</td>
                        <td className="vc-num" style={{ fontWeight: 700 }}>{pcs}</td>
                        <td className="vc-num" style={{ fontWeight: 700 }}>{formatSqft(totalSqft)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: Cutting List */}
          {activeTab === "cuts" && (
            <div style={{ overflowX: "auto" }}>
              <table className="vc-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Profile Section</th>
                    <th className="vc-num">Cut Length (mm)</th>
                    <th className="vc-num">Scaled Pieces Required</th>
                    <th className="vc-num">Total Run (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {scaledCuts.map((c, i) => {
                    const totalRunM = (c.lengthMm * c.qty) / 1000;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>
                          <span className="vc-pill vc-pill-sent" style={{ marginRight: 6 }}>
                            {c.profileId}
                          </span>
                          Profile {c.profileId}
                        </td>
                        <td className="vc-num">{c.lengthMm.toLocaleString("en-IN")} mm</td>
                        <td className="vc-num" style={{ fontWeight: 700 }}>{c.qty} pcs</td>
                        <td className="vc-num">{totalRunM.toFixed(2)} m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
