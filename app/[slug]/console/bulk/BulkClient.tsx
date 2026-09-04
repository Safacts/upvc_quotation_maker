"use client";

import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Plus,
  Layers,
  Sparkles,
  Download,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatMoney, formatSqft } from "@/lib/console-format";
import { buildBom, type WindowConfig, type WindowType } from "@/lib/bom-engine";

type Row = {
  room: string;
  w: number;
  h: number;
  type: string;
  glass: string;
  qty: number;
};

const SAMPLE_TEMPLATES: Record<string, string> = {
  "2BHK Apartment": `Room,Width,Height,Type,Glass,Qty
Living Room,2400,1800,sliding_3track,5-12-5,1
Master Bed,1800,1400,casement_double,5-12-5,1
Guest Bed,1500,1200,sliding_2track_2panel,5mm,1
Kitchen,1200,1000,sliding_2track_2panel,5mm,1
Utility / Balcony,900,1200,casement_single,5mm,1
Toilets,600,600,ventilator,Frosted 4mm,2`,
  "Standard Villa": `Room,Width,Height,Type,Glass,Qty
Main Hall,3000,2100,sliding_3track,6-12-6 DGU,1
Dining,1800,1800,french,5-12-5,1
Bed 1,1800,1500,casement_double,5-12-5,1
Bed 2,1800,1500,casement_double,5-12-5,1
Bed 3,1500,1400,sliding_2track_2panel,5mm,1
Kitchen,1200,1200,sliding_2track_2panel,5mm,1
Powder Room,600,750,ventilator,Frosted 4mm,1`,
};

function formatTypeLabel(t: string): string {
  const map: Record<string, string> = {
    casement_double: "Casement 2-sash",
    casement_single: "Casement 1-sash",
    casement_fixed_combo: "Fixed + Casement",
    sliding_2track_2panel: "Sliding 2T-2P",
    sliding_2track_3panel: "Sliding 2T-3P",
    sliding_3track: "Sliding 3T",
    french: "French Door",
    ventilator: "Ventilator",
    fixed: "Fixed Window",
  };
  return map[t] || t.replace(/_/g, " ");
}

function parseCSV(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const out: Row[] = [];
  const start =
    lines[0]?.toLowerCase().includes("room") ||
    lines[0]?.toLowerCase().includes("width")
      ? 1
      : 0;

  for (let i = start; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    const cols = rawLine.split(/[,;\t]/).map((s) => s.trim());
    if (cols.length < 2) continue;

    const room = cols[0] || `W${out.length + 1}`;
    const w = parseInt(cols[1], 10) || 0;
    const h = parseInt(cols[2], 10) || 0;
    const type = (cols[3] || "casement_double").toLowerCase().replace(/\s+/g, "_");
    const glass = cols[4] || "5-12-5";
    const qty = parseInt(cols[5], 10) || 1;

    if (w >= 300 && h >= 300) {
      out.push({ room, w, h, type, glass, qty });
    }
  }
  return out;
}

export default function BulkClient() {
  const { toast } = useConsole();
  const [text, setText] = useState<string>(SAMPLE_TEMPLATES["2BHK Apartment"]);
  const [rate, setRate] = useState(520);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => parseCSV(text), [text]);

  const totalWindows = useMemo(
    () => rows.reduce((s, r) => s + r.qty, 0),
    [rows],
  );

  const totalSqft = useMemo(
    () => rows.reduce((s, r) => s + (r.w / 304.8) * (r.h / 304.8) * r.qty, 0),
    [rows],
  );

  const totalEst = useMemo(() => {
    return rows.reduce((s, r) => {
      const bom = buildBom({
        type: (r.type as WindowType) || "casement_double",
        width: r.w,
        height: r.h,
        glassSpec: r.glass,
        ratePerSqft: rate,
      } as WindowConfig);
      return s + bom.price.total * r.qty;
    }, 0);
  }, [rows, rate]);

  // Connect to Console status bar
  useConsoleStatus({
    count: `${rows.length} lines (${totalWindows} windows)`,
    total: `${formatMoney(totalEst)} (${formatSqft(totalSqft)} sq.ft)`,
    hints: [
      { keys: "Ctrl+S / Alt+A", label: "Create Quotation Draft" },
    ],
  });

  async function createDraft() {
    if (!rows.length) {
      toast("No valid window rows parsed from CSV", "err");
      return;
    }
    if (saving) return;
    setSaving(true);

    const measured = rows.map((r) => ({
      width: r.w,
      height: r.h,
      units: r.qty,
      rate,
      description: `${r.room} — ${formatTypeLabel(r.type)} ${r.w}×${r.h} mm (${r.glass})`,
      glass: r.glass,
    }));

    try {
      const res = await fetch("/api/console/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          customer_name: "Bulk Site Import",
          contact_no: "",
          address: "",
          measured_items: measured,
          unmeasured_items: [],
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Failed to create draft");

      toast(
        `Quotation draft created (${j?.quote_no || j?.id}) — ${totalWindows} windows • ${formatMoney(totalEst)}`,
        "ok",
      );
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  useConsoleAction("save", createDraft);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 460px) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
      {/* LEFT: CSV Input Card */}
      <div className="vc-card">
        <div className="vc-card-head">
          <span className="vc-card-title">
            <FileSpreadsheet size={13} /> Site Measurement Import
          </span>
          <span style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>
            Excel / CSV Paste
          </span>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--vc-text-dim)", lineHeight: 1.4 }}>
            Paste columns directly from Excel: <code>Room, Width(mm), Height(mm), Type, Glass, Qty</code>. Instant BOM and pricing are computed automatically.
          </div>

          {/* Quick template pickers */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--vc-text-dim)" }}>Samples:</span>
            {Object.keys(SAMPLE_TEMPLATES).map((name) => (
              <button
                key={name}
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => setText(SAMPLE_TEMPLATES[name])}
                style={{ fontSize: 10.5, height: 22, padding: "0 6px" }}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => setText("Room,Width,Height,Type,Glass,Qty\n")}
              style={{ fontSize: 10.5, height: 22, padding: "0 6px", color: "var(--vc-text-dim)" }}
            >
              Clear
            </button>
          </div>

          {/* Rate input */}
          <div className="vc-field">
            <label className="vc-label">Global Rate / sq.ft (₹)</label>
            <input
              type="number"
              className="vc-input vc-num"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value || "0"))}
            />
          </div>

          {/* CSV Textarea */}
          <div className="vc-field">
            <label className="vc-label">CSV / Tab-Separated Data</label>
            <textarea
              className="vc-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              style={{
                fontFamily: "var(--vc-mono, monospace)",
                fontSize: 11.5,
                lineHeight: 1.5,
                resize: "vertical",
                whiteSpace: "pre",
              }}
              placeholder="Room,Width,Height,Type,Glass,Qty..."
            />
          </div>

          {/* Summary Chips */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "8px 10px", background: "var(--vc-surface-2)", borderRadius: "var(--vc-radius)", border: "1px solid var(--vc-border)" }}>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--vc-text-dim)" }}>Windows</div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{totalWindows} nos</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--vc-text-dim)" }}>Total Area</div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{formatSqft(totalSqft)} sq.ft</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--vc-text-dim)" }}>Est. Total</div>
              <div style={{ fontWeight: 800, fontSize: 12, color: "var(--vc-blue)" }}>{formatMoney(totalEst)}</div>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            className="vc-btn vc-btn-primary"
            style={{ justifyContent: "center", height: 34, fontSize: 12, marginTop: 4 }}
            onClick={createDraft}
            disabled={saving || rows.length === 0}
          >
            {saving ? (
              <span className="vc-spinner" />
            ) : (
              <FileText size={13} />
            )}
            Create Quotation Draft ({totalWindows} windows)
          </button>
        </div>
      </div>

      {/* RIGHT: Parsed Preview Grid */}
      <div className="vc-card">
        <div className="vc-card-head">
          <span className="vc-card-title">
            <Layers size={13} /> Parsed Windows Preview ({rows.length} lines)
          </span>
          <span className="vc-pill vc-pill-sent">
            {formatMoney(totalEst)}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="vc-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Line / Room</th>
                <th className="vc-num">Dimensions (W × H)</th>
                <th>Window Type</th>
                <th>Glass Spec</th>
                <th className="vc-num">Qty</th>
                <th className="vc-num">Area (sq.ft)</th>
                <th className="vc-num">Est. Line Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const bom = buildBom({
                  type: (r.type as WindowType) || "casement_double",
                  width: r.w,
                  height: r.h,
                  glassSpec: r.glass,
                  ratePerSqft: rate,
                } as WindowConfig);
                const lineSqft = (r.w / 304.8) * (r.h / 304.8) * r.qty;
                const lineTotal = bom.price.total * r.qty;

                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.room}</td>
                    <td className="vc-num">{r.w.toLocaleString("en-IN")} × {r.h.toLocaleString("en-IN")} mm</td>
                    <td>
                      <span className="vc-pill" style={{ fontSize: 10, padding: "0 6px" }}>
                        {formatTypeLabel(r.type)}
                      </span>
                    </td>
                    <td style={{ color: "var(--vc-text-dim)" }}>{r.glass}</td>
                    <td className="vc-num" style={{ fontWeight: 600 }}>{r.qty}</td>
                    <td className="vc-num">{formatSqft(lineSqft)}</td>
                    <td className="vc-num" style={{ fontWeight: 700 }}>{formatMoney(lineTotal)}</td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--vc-text-dim)" }}>
                    <AlertCircle size={20} style={{ margin: "0 auto 6px", opacity: 0.5 }} />
                    Paste rows in the CSV box on the left to preview windows here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
