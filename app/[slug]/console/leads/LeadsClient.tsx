"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, SlidersHorizontal, RefreshCw } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { ScreenConfigDialog } from "../_components/ScreenConfigDialog";
import { useScreenConfig } from "@/lib/hooks/useScreenConfig";
import type { ColumnSpec } from "@/lib/screen-config";
import { formatAmount, formatDate, toCsv, downloadFile } from "@/lib/console-format";

/** Ctrl+, column catalogue. Ids must match the accessorKeys below. */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "name", label: "Lead", required: true },
  { id: "company", label: "Company" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "source", label: "Source" },
  { id: "status", label: "Status" },
  { id: "value", label: "Value" },
  { id: "next_followup", label: "Next Follow-up" },
  { id: "activity_count", label: "Activities" },
  { id: "created_at", label: "Added" },
];

const SCREEN_ID = "leads";

const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
const LEAD_SOURCES = ["walk_in", "reference", "website", "call", "social", "other"];

const STATUS_COLORS: Record<string, string> = {
  new: "#EA580C",
  contacted: "#2563EB",
  qualified: "#0891B2",
  proposal: "#7C3AED",
  negotiation: "#C2410C",
  won: "#16A34A",
  lost: "#DC2626",
};

interface Row {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  value: number;
  notes: string;
  assigned_to: string;
  next_followup: string;
  activity_count: number;
  created_at: string;
}

/**
 * CRM — lead pipeline for the Ops Console.
 *
 * Backed by `/api/console/leads`. Statuses follow a classic sales pipeline
 * (new → contacted → qualified → proposal → negotiation → won/lost), and each
 * row carries an `activity_count` from the `lead_activities` table so an
 * operator can see at a glance which leads are being worked.
 */
export default function LeadsClient() {
  const { clientId, toast } = useConsole();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [creating, setCreating] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    source: "",
    status: "new",
    value: "",
    notes: "",
    assigned_to: "",
    next_followup: "",
  });

  const screen = useScreenConfig(clientId, SCREEN_ID, COLUMN_SPECS);
  const pageSize = screen.config.pageSize;

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, statusFilter, pageSize]);

  const load = useCallback(async () => {
    if (!screen.ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debounced) params.set("q", debounced);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/console/leads?${params}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load leads", "err");
        setRows([]);
        return;
      }
      setRows(data.rows || []);
      setTotalCount(data.total_count || 0);
      setTotalPages(data.total_pages || 1);
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debounced, statusFilter, toast, screen.ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const createLead = useCallback(async () => {
    if (!draft.name.trim()) {
      toast("Name is required", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...draft,
          value: draft.value === "" ? 0 : Number(draft.value),
          next_followup: draft.next_followup || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not save lead", "err");
        return;
      }
      toast("Lead added", "ok");
      setCreating(false);
      setDraft({ name: "", company: "", phone: "", email: "", source: "", status: "new", value: "", notes: "", assigned_to: "", next_followup: "" });
      void load();
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    }
  }, [draft, toast, load]);

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      ["Name", "Company", "Phone", "Email", "Source", "Status", "Value", "Next Follow-up", "Activities", "Added"],
      rows.map((r) => [
        r.name,
        r.company,
        r.phone,
        r.email,
        r.source,
        r.status,
        Number(r.value || 0).toFixed(2),
        r.next_followup ? formatDate(r.next_followup) : "",
        r.activity_count,
        formatDate(r.created_at),
      ]),
    );
    downloadFile(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} leads`, "ok");
  }, [rows, toast]);

  useConsoleAction("export", exportCsv);
  useConsoleAction("new", () => setCreating(true));
  useConsoleAction("search", () => {
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    el.select();
  });
  useConsoleAction("config", () => setConfigOpen(true));
  useConsoleAction("quickCreate", () => setCreating(true));
  useConsoleAction("prevRecord", () => {
    if (loading || page <= 1) return;
    setPage((p) => Math.max(1, p - 1));
  });
  useConsoleAction("nextRecord", () => {
    if (loading || page >= totalPages) return;
    setPage((p) => Math.min(totalPages, p + 1));
  });

  useConsoleStatus({
    busy: loading,
    count: `${rows.length} of ${totalCount} leads`,
    hints: [
      { keys: "PgUp/PgDn", label: "Page" },
      { keys: "Ctrl+F", label: "Search" },
      { keys: "Alt+N", label: "New" },
      { keys: "Ctrl+,", label: "Columns" },
      { keys: "Ctrl+E", label: "Export" },
    ],
  });

  const allColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Lead",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      { accessorKey: "company", header: "Company" },
      { accessorKey: "phone", header: "Phone", enableSorting: false },
      { accessorKey: "email", header: "Email", enableSorting: false },
      { accessorKey: "source", header: "Source" },
      {
        accessorKey: "status",
        header: "Status",
        cell: (c) => {
          const s = String(c.getValue() || "new");
          return (
            <span
              style={{
                display: "inline-block",
                padding: "1px 7px",
                borderRadius: 20,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                background: STATUS_COLORS[s] ? `${STATUS_COLORS[s]}1a` : "#eef0f3",
                color: STATUS_COLORS[s] || "#5b6673",
              }}
            >
              {s}
            </span>
          );
        },
      },
      {
        accessorKey: "value",
        header: "Value",
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      {
        accessorKey: "next_followup",
        header: "Next Follow-up",
        cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "—"),
      },
      {
        accessorKey: "activity_count",
        header: "Activities",
        enableSorting: false,
        meta: { align: "right" },
      },
      {
        accessorKey: "created_at",
        header: "Added",
        cell: (c) => formatDate(c.getValue()),
      },
    ],
    [],
  );

  const columns = useMemo(() => screen.applyTo(allColumns), [allColumns, screen]);

  return (
    <div className="vc-pad">
      <div className="vc-card">
        <div className="vc-toolbar">
          <div className="vc-search">
            <input
              ref={searchRef}
              className="vc-input"
              style={{ paddingLeft: 27 }}
              placeholder="Search name, company, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search size={13} style={{ position: "absolute", left: 8, top: 8, color: "#8a94a1" }} />
          </div>

          <select
            className="vc-select"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          <button type="button" className="vc-btn" onClick={() => void load()} title="Refresh">
            <RefreshCw size={13} />
          </button>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="vc-btn"
            onClick={() => setConfigOpen(true)}
            title="Configure columns and density (Ctrl+,)"
          >
            <SlidersHorizontal size={13} /> <span className="vc-kbd">Ctrl ,</span>
          </button>
          <button type="button" className="vc-btn" onClick={exportCsv}>
            <Download size={13} /> CSV
          </button>
          <button type="button" className="vc-btn vc-btn-primary" onClick={() => setCreating((v) => !v)}>
            <Plus size={13} /> New <span className="vc-kbd">Alt N</span>
          </button>
        </div>

        {creating && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr 1.4fr 0.9fr 1fr 1fr auto",
              gap: 8,
              padding: 11,
              borderBottom: "1px solid var(--vc-border)",
              background: "var(--vc-surface-2)",
              alignItems: "end",
            }}
          >
            <div className="vc-field">
              <label className="vc-label">
                Name <span className="vc-req">*</span>
              </label>
              <input
                className="vc-input"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createLead()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Company</label>
              <input
                className="vc-input"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Phone</label>
              <input
                className="vc-input"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Email</label>
              <input
                className="vc-input"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Source</label>
              <select
                className="vc-select"
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              >
                <option value="">—</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="vc-field">
              <label className="vc-label">Status</label>
              <select
                className="vc-select"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="vc-field">
              <label className="vc-label">Value (₹)</label>
              <input
                className="vc-input vc-num"
                inputMode="decimal"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createLead()}>
                Save
              </button>
              <button type="button" className="vc-btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <DataGrid<Row>
          data={rows}
          columns={columns}
          density={screen.config.density}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle={debounced || statusFilter ? "No matching leads" : "No leads yet"}
          emptyHint={debounced || statusFilter ? "Try clearing the search or status filter." : "Press Alt+N to add your first lead."}
          maxHeight="calc(100vh - 230px)"
        />

        <div className="vc-pager">
          <span>
            Page {page} of {totalPages} · {totalCount} total
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="vc-btn vc-btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="vc-btn vc-btn-sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </button>
        </div>
      </div>

      {configOpen && (
        <ScreenConfigDialog
          title="Leads"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
