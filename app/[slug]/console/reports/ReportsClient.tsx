"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  FileText,
  Users,
  Package,
  Trophy,
  Download,
  RefreshCw,
  Calendar,
  ChevronRight,
  FileSpreadsheet,
  FileCode,
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { customPeriod, describePeriod, toInclusiveEnd } from "@/lib/period";
import { DataGrid, type DataGridProps } from "../_components/DataGrid";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  formatMoney,
  formatMoneyCompact,
  formatDate,
  formatAmount,
  toDateInputValue,
} from "@/lib/console-format";

/**
 * ReportsClient — the commercial reports hub with drill-down.
 *
 * Five reports share ONE screen: the user picks a report from the left rail,
 * sets a date range, and the grid + summary update. Every report row supports
 * Enter-to-drill-down (Tally pillar #3): a sales-register row opens the
 * quotation, a customer-ledger row filters the sales register to that customer.
 *
 * Exports (CSV / XLSX / Tally XML) POST the current filter to
 * `/api/console/export`, which re-validates the scope server-side.
 */

type ReportType = "sales_register" | "customer_ledger" | "product_movement" | "win_loss" | "gst_summary";

interface ReportMeta {
  key: ReportType;
  label: string;
  description: string;
  icon: typeof FileText;
}

const REPORTS: ReportMeta[] = [
  { key: "sales_register", label: "Sales Register", description: "Every quotation in the period", icon: FileText },
  { key: "customer_ledger", label: "Customer Ledger", description: "Totals grouped by customer", icon: Users },
  { key: "product_movement", label: "Product Movement", description: "Line items aggregated across quotes", icon: Package },
  { key: "win_loss", label: "Win / Loss", description: "Conversion by status", icon: Trophy },
  { key: "gst_summary", label: "GST Summary", description: "Filed GST invoices", icon: BarChart3 },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function ReportsClient() {
  const router = useRouter();
  const { slug, toast, period, setPeriod, openPeriodSelector } = useConsole();

  const [report, setReport] = useState<ReportType>("sales_register");
  /**
   * The date range comes from the SHELL's F2 period, not from local state.
   *
   * Reports is the screen where a wrong period does the most damage — these
   * numbers get read to an accountant. Sourcing the range from the same place
   * the topbar chip displays means the caption and the query can never
   * disagree, and the range survives navigating away and back.
   *
   * The two date inputs below still work; they write THROUGH to the shell via
   * `customPeriod`, so typing a date and pressing F2 show the same thing.
   */
  const from = period.from;
  // `period.to` is EXCLUSIVE (see period.ts); the input must show the
  // inclusive day the user actually means.
  const toIncl = toInclusiveEnd(period.to);
  const to = period.to;
  const [status, setStatus] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");

  const meta = REPORTS.find((r) => r.key === report)!;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: report });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (status) params.set("status", status);

      const res = await fetch(`/api/console/reports?${params}`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setData(json);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [report, from, to, status]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ---- Status bar -----------------------------------------------------------
  useConsoleStatus({
    count: data
      ? `${data.rows?.length ?? 0} rows · ${describePeriod(period)}`
      : describePeriod(period),
    total: data?.summary?.total_grand != null ? formatMoneyCompact(data.summary.total_grand)
      : data?.summary?.total_revenue != null ? formatMoneyCompact(data.summary.total_revenue)
      : data?.summary?.total_net != null ? formatMoneyCompact(data.summary.total_net)
      : undefined,
    hints: [
      { keys: "Ctrl+E", label: "Export" },
      { keys: "Enter", label: "Drill down" },
    ],
    busy: loading,
  });

  // ---- Export ---------------------------------------------------------------
  const handleExport = useCallback(
    async (format: "csv" | "xlsx" | "tally_xml") => {
      setExporting(format);
      try {
        // Build the id list for the current filter. For reports that list
        // individual quotations (sales_register), export those exact rows. For
        // grouped reports we export the raw data client-side as a snapshot.
        const ids: string[] = (data?.rows || [])
          .map((r: any) => r.id)
          .filter(Boolean);

        if (ids.length === 0) {
          toast("No rows to export", "err");
          return;
        }

        const res = await fetch("/api/console/export", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, format }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Export failed (${res.status})`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = format === "tally_xml" ? "xml" : format === "xlsx" ? "xls" : "csv";
        a.download = `${report}_export.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast(`Exported ${ids.length} rows as ${format.toUpperCase()}`, "ok");
      } catch (e: any) {
        toast(String(e?.message ?? e), "err");
      } finally {
        setExporting("");
      }
    },
    [data, report, toast],
  );

  // Ctrl+E on this screen means CSV — the most portable of the three formats
  // and the one an accountant can open anywhere. XLSX and Tally XML stay as
  // explicit buttons because they are deliberate choices, not defaults.
  //
  // Registered AFTER handleExport is declared: `const` is in the temporal dead
  // zone until its initialiser runs, and referencing it above would throw on
  // first render.
  useConsoleAction("export", () => void handleExport("csv"));

  // ---- Drill-down -----------------------------------------------------------
  const onRowActivate = useCallback(
    (row: any) => {
      if (report === "sales_register" && row.id) {
        router.push(`/${slug}/console/quotations/${row.id}`);
      }
    },
    [report, router, slug],
  );

  // ---- Columns per report ---------------------------------------------------
  const columns = useMemo(() => buildColumns(report), [report]);

  // ---- Summary tiles --------------------------------------------------------
  const summaryTiles = useMemo(() => buildSummary(report, data), [report, data]);

  return (
    <div className="vc-reports">
      {/* Left rail: report picker */}
      <div className="vc-reports-rail">
        <div className="vc-reports-rail-title">Reports</div>
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.key}
              type="button"
              className={"vc-reports-rail-item" + (report === r.key ? " vc-active" : "")}
              onClick={() => setReport(r.key)}
            >
              <Icon size={15} strokeWidth={2} />
              <span className="vc-reports-rail-label">{r.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main */}
      <div className="vc-reports-main">
        {/* Header */}
        <div className="vc-reports-head">
          <div className="vc-reports-head-title">
            <ChevronRight size={14} className="vc-muted" />
            {meta.label}
            <span className="vc-reports-head-desc">{meta.description}</span>
          </div>
          <div className="vc-reports-actions">
            <button
              type="button"
              className="vc-btn"
              onClick={() => handleExport("csv")}
              disabled={!!exporting || loading}
              title="Export as CSV (Ctrl+E)"
            >
              <FileText size={13} /> CSV
            </button>
            <button
              type="button"
              className="vc-btn"
              onClick={() => handleExport("xlsx")}
              disabled={!!exporting || loading}
              title="Export as Excel"
            >
              <FileSpreadsheet size={13} /> XLSX
            </button>
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              onClick={() => handleExport("tally_xml")}
              disabled={!!exporting || loading}
              title="Export as Tally XML"
            >
              <FileCode size={13} /> {exporting === "tally_xml" ? "Exporting..." : "Tally XML"}
            </button>
            <button
              type="button"
              className="vc-btn"
              onClick={fetchReport}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? "vc-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="vc-reports-filters">
          {/* F2 is the fast path; these two inputs are the discoverable one.
              Both write to the same shell-level period, so they can never
              disagree with the chip in the topbar. */}
          <div className="vc-field">
            <label className="vc-label"><Calendar size={12} /> From</label>
            <input
              type="date"
              className="vc-input"
              value={toDateInputValue(from)}
              onChange={(e) => setPeriod(customPeriod(e.target.value, toIncl))}
            />
          </div>
          <div className="vc-field">
            <label className="vc-label"><Calendar size={12} /> To</label>
            <input
              type="date"
              className="vc-input"
              value={toIncl}
              onChange={(e) => setPeriod(customPeriod(from, e.target.value))}
            />
          </div>
          <div className="vc-field">
            <label className="vc-label">Period</label>
            <button
              type="button"
              className="vc-btn"
              onClick={openPeriodSelector}
              title="Change period (F2)"
            >
              <Calendar size={12} /> {describePeriod(period)}{" "}
              <span className="vc-kbd">F2</span>
            </button>
          </div>
          <div className="vc-field">
            <label className="vc-label">Status</label>
            <select className="vc-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {data?.from && (
            <div className="vc-reports-range vc-muted">
              {formatDate(data.from)} → {formatDate(data.to)}
              {data.truncated && " (truncated)"}
            </div>
          )}
        </div>

        {/* Summary tiles */}
        {summaryTiles.length > 0 && (
          <div className="vc-reports-summary">
            {summaryTiles.map((t) => (
              <div className="vc-summary-tile" key={t.label}>
                <div className="vc-summary-tile-label">{t.label}</div>
                <div className={"vc-summary-tile-value" + (t.tone ? " " + t.tone : "")}>{t.value}</div>
                {t.sub && <div className="vc-summary-tile-sub vc-muted">{t.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <div className="vc-error">{error}</div>}

        {/* Grid */}
        <DataGrid
          data={data?.rows || []}
          columns={columns}
          getRowId={(row: any) => row.id ?? row.customer_name ?? row.status ?? row.invoice_number ?? `row-${JSON.stringify(row).slice(0, 64)}`}
          onRowActivate={onRowActivate}
          loading={loading}
          emptyTitle="No data for this range"
          emptyHint="Try widening the date range or clearing the status filter."
          maxHeight="calc(100vh - 320px)"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function buildColumns(report: ReportType): ColumnDef<any, any>[] {
  const num = { meta: { align: "right" as const } };
  const dt: ColumnDef<any, any>[] = [];

  switch (report) {
    case "sales_register":
      dt.push(
        { accessorKey: "date", header: "Date", cell: (c) => formatDate(c.getValue()) },
        { accessorKey: "quote_no", header: "Quote No" },
        { accessorKey: "customer_name", header: "Customer" },
        { accessorKey: "status", header: "Status", cell: (c) => <span className={`vc-pill vc-pill-${c.getValue()}`}>{c.getValue()}</span> },
        { accessorKey: "net_total", header: "Net Total", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "gst_amount", header: "GST", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "grand_total", header: "Grand Total", ...num, cell: (c) => <b>{formatAmount(c.getValue())}</b> },
      );
      break;
    case "customer_ledger":
      dt.push(
        { accessorKey: "customer_name", header: "Customer" },
        { accessorKey: "quote_count", header: "Quotes", ...num },
        { accessorKey: "won_count", header: "Won", ...num },
        { accessorKey: "win_rate_pct", header: "Win %", ...num, cell: (c) => `${c.getValue()}%` },
        { accessorKey: "total_net", header: "Net Total", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "total_grand", header: "Grand Total", ...num, cell: (c) => <b>{formatAmount(c.getValue())}</b> },
        { accessorKey: "last_quote_date", header: "Last Quote", cell: (c) => formatDate(c.getValue()) },
      );
      break;
    case "product_movement":
      dt.push(
        { accessorKey: "label", header: "Product" },
        { accessorKey: "kind", header: "Kind", cell: (c) => c.getValue() === "measured" ? "Area" : "Unit" },
        { accessorKey: "times_quoted", header: "Times Quoted", ...num },
        { accessorKey: "total_qty", header: "Qty", ...num },
        { accessorKey: "total_sqft", header: "Sqft", ...num, cell: (c) => Number(c.getValue()).toFixed(2) },
        { accessorKey: "total_revenue", header: "Revenue", ...num, cell: (c) => <b>{formatAmount(c.getValue())}</b> },
      );
      break;
    case "win_loss":
      dt.push(
        { accessorKey: "status", header: "Status", cell: (c) => <span className={`vc-pill vc-pill-${c.getValue()}`}>{c.getValue()}</span> },
        { accessorKey: "count", header: "Count", ...num },
        { accessorKey: "net_total", header: "Net Total", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "grand_total", header: "Grand Total", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "pct_of_count", header: "% of Count", ...num, cell: (c) => `${c.getValue()}%` },
        { accessorKey: "pct_of_value", header: "% of Value", ...num, cell: (c) => `${c.getValue()}%` },
      );
      break;
    case "gst_summary":
      dt.push(
        { accessorKey: "invoice_date", header: "Date", cell: (c) => formatDate(c.getValue()) },
        { accessorKey: "invoice_number", header: "Invoice No" },
        { accessorKey: "buyer_name", header: "Buyer" },
        { accessorKey: "taxable_value", header: "Taxable", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "cgst_amount", header: "CGST", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "sgst_amount", header: "SGST", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "igst_amount", header: "IGST", ...num, cell: (c) => formatAmount(c.getValue()) },
        { accessorKey: "grand_total", header: "Grand Total", ...num, cell: (c) => <b>{formatAmount(c.getValue())}</b> },
      );
      break;
  }
  return dt;
}

// ---------------------------------------------------------------------------
// Summary tiles
// ---------------------------------------------------------------------------

function buildSummary(report: ReportType, data: any): Array<{ label: string; value: string; sub?: string; tone?: string }> {
  if (!data?.summary) return [];
  const s = data.summary;
  const tiles: Array<{ label: string; value: string; sub?: string; tone?: string }> = [];

  switch (report) {
    case "sales_register":
      tiles.push(
        { label: "Quotations", value: String(s.count) },
        { label: "Net Total", value: formatMoneyCompact(s.total_net) },
        { label: "GST", value: formatMoneyCompact(s.total_gst) },
        { label: "Grand Total", value: formatMoneyCompact(s.total_grand), tone: "vc-tone-accent" },
        { label: "Won", value: `${s.won_count}`, sub: formatMoneyCompact(s.won_net) },
      );
      break;
    case "customer_ledger":
      tiles.push(
        { label: "Customers", value: String(s.unique_customers) },
        { label: "Grand Total", value: formatMoneyCompact(s.total_grand), tone: "vc-tone-accent" },
      );
      break;
    case "product_movement":
      tiles.push(
        { label: "Products", value: String(s.unique_products) },
        { label: "Revenue", value: formatMoneyCompact(s.total_revenue), tone: "vc-tone-accent" },
      );
      break;
    case "win_loss":
      tiles.push(
        { label: "Total", value: String(s.total) },
        { label: "Win Rate", value: `${s.win_rate_pct}%`, tone: "vc-tone-accent" },
        { label: "Won Value", value: formatMoneyCompact(s.won_net), tone: "vc-tone-ok" },
        { label: "Lost Value", value: formatMoneyCompact(s.lost_net), tone: "vc-tone-err" },
        { label: "Pending", value: formatMoneyCompact(s.pending_net) },
      );
      break;
    case "gst_summary":
      tiles.push(
        { label: "Invoices", value: String(s.invoice_count) },
        { label: "Taxable", value: formatMoneyCompact(s.total_taxable) },
        { label: "CGST", value: formatMoneyCompact(s.total_cgst) },
        { label: "SGST", value: formatMoneyCompact(s.total_sgst) },
        { label: "IGST", value: formatMoneyCompact(s.total_igst) },
        { label: "Grand Total", value: formatMoneyCompact(s.total_grand), tone: "vc-tone-accent" },
      );
      break;
  }
  return tiles;
}
