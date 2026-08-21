"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, ExternalLink, Factory, GlassWater, Printer, RefreshCw, Scissors, Wrench } from "lucide-react";
import { useConsole, useConsoleAction, useConsoleStatus } from "../ConsoleShell";
import { downloadFile, toCsv } from "@/lib/console-format";

type Item = {
  id?: string; code?: string; description?: string; glass?: string;
  width?: number | string; height?: number | string; units?: number | string;
  bom_config?: { profile?: { system?: string; color?: string }; glass?: { type?: string; thickness?: string }; hardware?: Array<{ name?: string; type?: string; quantity?: number | string }> };
};
type Quotation = { id: string; quote_no?: string; customer_name?: string; date?: string };
type Report = { quotation: Quotation; measured: Item[]; unmeasured: Item[] };
const n = (value: unknown, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
const csvValue = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ");

export default function FactoryReportsClient() {
  const { slug, toast } = useConsole();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"cutting" | "glass" | "accessories">("cutting");
  const [loading, setLoading] = useState(false);

  const loadQuotations = useCallback(async () => {
    try {
      const res = await fetch("/api/console/quotations?page=1&page_size=100&sort=created_at&dir=desc", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load quotations");
      const rows = (data.rows || []) as Quotation[];
      setQuotations(rows);
      if (!selectedId && rows[0]?.id) setSelectedId(rows[0].id);
    } catch (error: any) { toast(String(error?.message ?? error), "err"); }
  }, [selectedId, toast]);

  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/console/quotations/${selectedId}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load quotation");
      setReport({ quotation: data.quotation, measured: data.measured_items || [], unmeasured: data.unmeasured_items || [] });
    } catch (error: any) { setReport(null); toast(String(error?.message ?? error), "err"); }
    finally { setLoading(false); }
  }, [selectedId, toast]);

  useEffect(() => { void loadQuotations(); }, [loadQuotations]);
  useEffect(() => { void loadReport(); }, [loadReport]);

  const cuttingRows = useMemo(() => {
    if (!report) return [];
    const rows: Array<{ profile: string; item: string; length: number; quantity: number; note: string }> = [];
    for (const item of report.measured) {
      const width = Math.round(n(item.width)); const height = Math.round(n(item.height)); const quantity = Math.max(1, Math.round(n(item.units, 1)));
      if (width <= 0 || height <= 0) continue;
      const profile = item.bom_config?.profile?.system || "Configured profile"; const label = item.code || item.description || "Window item";
      rows.push({ profile, item: label, length: height, quantity: quantity * 2, note: "Vertical pair" });
      rows.push({ profile, item: label, length: width, quantity: quantity * 2, note: "Horizontal pair" });
    }
    return rows;
  }, [report]);

  const glassRows = useMemo(() => !report ? [] : report.measured.map((item) => {
    const width = Math.max(0, n(item.width) - 100); const height = Math.max(0, n(item.height) - 100); const quantity = Math.max(1, Math.round(n(item.units, 1)));
    return { item: item.code || item.description || "Window item", specification: item.glass || item.bom_config?.glass?.type || "Not specified", size: `${Math.round(width)} × ${Math.round(height)} mm`, quantity, area: ((width * height * quantity) / 1_000_000).toFixed(2), note: "Opening allowance: 50 mm per side" };
  }), [report]);

  const accessoryRows = useMemo(() => {
    if (!report) return [];
    const rows: Array<{ item: string; specification: string; quantity: number }> = [];
    for (const item of report.measured) for (const hardware of item.bom_config?.hardware || []) rows.push({ item: item.code || item.description || "Window item", specification: hardware.name || hardware.type || "Hardware", quantity: Math.max(1, n(hardware.quantity, 1)) * Math.max(1, n(item.units, 1)) });
    for (const item of report.unmeasured) rows.push({ item: item.description || "Accessory", specification: "Quotation line item", quantity: Math.max(1, n(item.units, 1)) });
    return rows;
  }, [report]);

  const exportReport = useCallback(() => {
    if (!report) return toast("Select a quotation first", "info");
    const rows = tab === "cutting" ? [["Profile", "Quotation item", "Cut length (mm)", "Quantity", "Note"], ...cuttingRows.map((r) => [r.profile, r.item, r.length, r.quantity, r.note])] : tab === "glass" ? [["Quotation item", "Specification", "Size", "Quantity", "Area (m²)", "Note"], ...glassRows.map((r) => [r.item, r.specification, r.size, r.quantity, r.area, r.note])] : [["Quotation item", "Specification", "Quantity"], ...accessoryRows.map((r) => [r.item, r.specification, r.quantity])];
    downloadFile(`${tab}-boq-${report.quotation.quote_no || report.quotation.id}.csv`, toCsv(rows[0].map(csvValue), rows.slice(1).map((row) => row.map(csvValue))));
    toast("Factory report exported", "ok");
  }, [accessoryRows, cuttingRows, glassRows, report, tab, toast]);

  useConsoleAction("export", exportReport);
  useConsoleStatus({ busy: loading, count: report ? `${report.quotation.quote_no || "Quotation"} · ${tab}` : "Select a quotation", hints: [{ keys: "Ctrl+E", label: "Export" }] });
  const renderEmpty = (message: string) => <div className="vc-empty"><div className="vc-empty-title">{message}</div><div style={{ marginTop: 5 }}>Add BOM configuration to the quotation to populate this report.</div></div>;

  return <div className="vc-pad">
    <div className="vc-card"><div className="vc-card-head"><div><div className="vc-card-title"><Factory size={16} /> Factory Reports</div><div className="vc-muted">Cutting schedule, glass BOQ, and accessories BOQ for one quotation.</div></div><div style={{ display: "flex", gap: 6 }}><button className="vc-btn" type="button" onClick={() => void loadReport()} disabled={loading}><RefreshCw size={13} /> Refresh</button><button className="vc-btn" type="button" onClick={() => window.print()}><Printer size={13} /> Print</button></div></div>
      <div className="vc-toolbar"><label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 260 }}><span className="vc-muted">Quotation</span><select className="vc-select" style={{ flex: 1, maxWidth: 440 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Select quotation...</option>{quotations.map((q) => <option key={q.id} value={q.id}>{q.quote_no || q.id} — {q.customer_name || "No customer"}</option>)}</select></label>{report && <a className="vc-btn" href={`/${slug}/console/quotations/${report.quotation.id}`}><ExternalLink size={13} /> Open quotation</a>}<button className="vc-btn" type="button" onClick={exportReport} disabled={!report}><Download size={13} /> Export CSV</button></div>
    </div>
    {report && <div className="vc-card" style={{ marginTop: 12 }}><div className="vc-toolbar" style={{ gap: 4 }}>{(["cutting", "glass", "accessories"] as const).map((key) => { const Icon = key === "cutting" ? Scissors : key === "glass" ? GlassWater : Wrench; const label = key === "cutting" ? "Cutting Schedule" : key === "glass" ? "Glass BOQ" : "Accessories BOQ"; return <button key={key} type="button" className={`vc-btn ${tab === key ? "vc-btn-primary" : ""}`} onClick={() => setTab(key)}><Icon size={13} /> {label}</button>; })}<div style={{ flex: 1 }} /><span className="vc-muted">{report.quotation.quote_no || "Quotation"} · {report.quotation.customer_name || "No customer"}</span></div>
      {tab === "cutting" && (cuttingRows.length ? <table className="vc-table"><thead><tr><th>Profile</th><th>Quotation item</th><th className="vc-num">Cut length</th><th className="vc-num">Qty</th><th>Purpose</th></tr></thead><tbody>{cuttingRows.map((r, i) => <tr key={`${r.item}-${i}`}><td><b>{r.profile}</b></td><td>{r.item}</td><td className="vc-num">{r.length} mm</td><td className="vc-num">{r.quantity}</td><td>{r.note}</td></tr>)}</tbody></table> : renderEmpty("No measured items with dimensions"))}
      {tab === "glass" && (glassRows.length ? <table className="vc-table"><thead><tr><th>Quotation item</th><th>Specification</th><th>Size</th><th className="vc-num">Qty</th><th className="vc-num">Area</th><th>Note</th></tr></thead><tbody>{glassRows.map((r, i) => <tr key={`${r.item}-${i}`}><td><b>{r.item}</b></td><td>{r.specification}</td><td>{r.size}</td><td className="vc-num">{r.quantity}</td><td className="vc-num">{r.area} m²</td><td className="vc-muted">{r.note}</td></tr>)}</tbody></table> : renderEmpty("No glass rows"))}
      {tab === "accessories" && (accessoryRows.length ? <table className="vc-table"><thead><tr><th>Quotation item</th><th>Specification</th><th className="vc-num">Quantity</th></tr></thead><tbody>{accessoryRows.map((r, i) => <tr key={`${r.item}-${i}`}><td><b>{r.item}</b></td><td>{r.specification}</td><td className="vc-num">{r.quantity}</td></tr>)}</tbody></table> : renderEmpty("No configured accessories"))}</div>}
    {!report && !loading && <div className="vc-card" style={{ marginTop: 12 }}>{renderEmpty("Select a quotation to view factory reports")}</div>}
    {report && <div className="vc-muted" style={{ marginTop: 8, fontSize: 11 }}><ClipboardList size={12} style={{ verticalAlign: "-2px" }} /> Planning view only. Cutting lengths and glass allowances should be checked by the factory supervisor before production.</div>}
  </div>;
}
