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
import { sanitizeNumericInput } from "@/lib/console-validators";

/** Ctrl+, column catalogue. Ids must match the accessorKeys below. */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "project_name", label: "Project", required: true },
  { id: "status", label: "Status" },
  { id: "lead", label: "Lead" },
  { id: "order", label: "Order" },
  { id: "start_date", label: "Start" },
  { id: "end_date", label: "End" },
  { id: "budget", label: "Budget" },
  { id: "actual_cost", label: "Actual" },
  { id: "progress", label: "Progress" },
  { id: "created_at", label: "Added" },
];

const SCREEN_ID = "projects";

const PROJECT_STATUSES = ["planning", "in_progress", "on_hold", "completed", "cancelled"];

const STATUS_COLORS: Record<string, string> = {
  planning: "#0891B2",
  in_progress: "#EA580C",
  on_hold: "#CA8A04",
  completed: "#16A34A",
  cancelled: "#DC2626",
};

interface Row {
  id: string;
  project_name: string;
  status: string;
  lead: { id: string; name: string; company: string } | null;
  order: { id: string; order_number: string; status: string } | null;
  start_date: string;
  end_date: string;
  budget: number;
  actual_cost: number;
  progress: number;
  notes: string;
  created_at: string;
}

/**
 * Projects — site-level delivery tracking.
 *
 * Backed by `/api/console/projects`. A project binds a lead to an order (both
 * optional until the sales loop closes) and tracks budget vs actual cost plus a
 * 0–100 progress bar. Statuses follow the delivery lifecycle.
 */
export default function ProjectsClient() {
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
    project_name: "",
    status: "planning",
    budget: "",
    actual_cost: "",
    progress: "",
    notes: "",
    start_date: "",
    end_date: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      const res = await fetch(`/api/console/projects?${params}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load projects", "err");
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

  const createProject = useCallback(async () => {
    setFieldErrors({});
    if (!draft.project_name.trim()) {
      setFieldErrors({ project_name: "Project name is required" });
      toast("Project name is required", "err");
      return;
    }
    if (draft.budget && (isNaN(Number(draft.budget)) || Number(draft.budget) < 0)) {
      setFieldErrors({ budget: "Budget cannot be negative" });
      toast("Budget cannot be negative", "err");
      return;
    }
    if (draft.actual_cost && (isNaN(Number(draft.actual_cost)) || Number(draft.actual_cost) < 0)) {
      setFieldErrors({ actual_cost: "Actual cost cannot be negative" });
      toast("Actual cost cannot be negative", "err");
      return;
    }
    if (draft.progress && (isNaN(Number(draft.progress)) || Number(draft.progress) < 0 || Number(draft.progress) > 100)) {
      setFieldErrors({ progress: "Progress must be 0–100%" });
      toast("Progress % must be between 0 and 100", "err");
      return;
    }
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      setFieldErrors({ end_date: "End date cannot be before start date" });
      toast("End date cannot be earlier than start date", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          project_name: draft.project_name,
          status: draft.status,
          budget: draft.budget === "" ? 0 : Number(draft.budget),
          actual_cost: draft.actual_cost === "" ? 0 : Number(draft.actual_cost),
          progress: draft.progress === "" ? 0 : Number(draft.progress),
          notes: draft.notes,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not save project", "err");
        return;
      }
      toast("Project added", "ok");
      setCreating(false);
      setDraft({ project_name: "", status: "planning", budget: "", actual_cost: "", progress: "", notes: "", start_date: "", end_date: "" });
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
      ["Project", "Status", "Lead", "Order", "Start", "End", "Budget", "Actual", "Progress %", "Added"],
      rows.map((r) => [
        r.project_name,
        r.status,
        r.lead?.name || "",
        r.order?.order_number || "",
        r.start_date ? formatDate(r.start_date) : "",
        r.end_date ? formatDate(r.end_date) : "",
        Number(r.budget || 0).toFixed(2),
        Number(r.actual_cost || 0).toFixed(2),
        r.progress,
        formatDate(r.created_at),
      ]),
    );
    downloadFile(`projects-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} projects`, "ok");
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
    count: `${rows.length} of ${totalCount} projects`,
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
        accessorKey: "project_name",
        header: "Project",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (c) => {
          const s = String(c.getValue() || "planning");
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
              {s.replace("_", " ")}
            </span>
          );
        },
      },
      {
        accessorKey: "lead",
        header: "Lead",
        cell: (c) => {
          const lead = c.getValue() as Row["lead"];
          return lead ? lead.name || lead.company || "—" : "—";
        },
      },
      {
        accessorKey: "order",
        header: "Order",
        cell: (c) => {
          const order = c.getValue() as Row["order"];
          return order?.order_number || "—";
        },
      },
      {
        accessorKey: "start_date",
        header: "Start",
        cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "—"),
      },
      {
        accessorKey: "end_date",
        header: "End",
        cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "—"),
      },
      {
        accessorKey: "budget",
        header: "Budget",
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      {
        accessorKey: "actual_cost",
        header: "Actual",
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      {
        accessorKey: "progress",
        header: "Progress",
        enableSorting: false,
        cell: (c) => {
          const p = Number(c.getValue()) || 0;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 90 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#eef0f3", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${p}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: p >= 100 ? "#16A34A" : "#EA580C",
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: "#5b6673", width: 30, textAlign: "right" }}>{p}%</span>
            </div>
          );
        },
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
              placeholder="Search project, notes..."
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
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
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
              gridTemplateColumns: "1.6fr 1fr 1fr 0.8fr 1fr 1fr auto",
              gap: 8,
              padding: 11,
              borderBottom: "1px solid var(--vc-border)",
              background: "var(--vc-surface-2)",
              alignItems: "end",
            }}
          >
            <div className="vc-field">
              <label className="vc-label">
                Project name <span className="vc-req">*</span>
              </label>
              <input
                className={"vc-input" + (fieldErrors.project_name ? " vc-invalid" : "")}
                value={draft.project_name}
                autoFocus
                onChange={(e) => {
                  setDraft({ ...draft, project_name: e.target.value });
                  if (fieldErrors.project_name) setFieldErrors((f) => ({ ...f, project_name: "" }));
                }}
                onKeyDown={(e) => e.key === "Enter" && void createProject()}
              />
              {fieldErrors.project_name && <span className="vc-err">{fieldErrors.project_name}</span>}
            </div>
            <div className="vc-field">
              <label className="vc-label">Status</label>
              <select
                className="vc-select"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="vc-field">
              <label className="vc-label">Budget (₹)</label>
              <input
                className={"vc-input vc-num" + (fieldErrors.budget ? " vc-invalid" : "")}
                inputMode="decimal"
                value={draft.budget}
                onChange={(e) => {
                  const cleaned = sanitizeNumericInput(e.target.value, true);
                  setDraft({ ...draft, budget: cleaned });
                  if (fieldErrors.budget) setFieldErrors((f) => ({ ...f, budget: "" }));
                }}
              />
              {fieldErrors.budget && <span className="vc-err">{fieldErrors.budget}</span>}
            </div>
            <div className="vc-field">
              <label className="vc-label">Actual (₹)</label>
              <input
                className={"vc-input vc-num" + (fieldErrors.actual_cost ? " vc-invalid" : "")}
                inputMode="decimal"
                value={draft.actual_cost}
                onChange={(e) => {
                  const cleaned = sanitizeNumericInput(e.target.value, true);
                  setDraft({ ...draft, actual_cost: cleaned });
                  if (fieldErrors.actual_cost) setFieldErrors((f) => ({ ...f, actual_cost: "" }));
                }}
              />
              {fieldErrors.actual_cost && <span className="vc-err">{fieldErrors.actual_cost}</span>}
            </div>
            <div className="vc-field">
              <label className="vc-label">Progress %</label>
              <input
                className={"vc-input vc-num" + (fieldErrors.progress ? " vc-invalid" : "")}
                inputMode="numeric"
                value={draft.progress}
                onChange={(e) => {
                  const cleaned = sanitizeNumericInput(e.target.value, false);
                  setDraft({ ...draft, progress: cleaned });
                  if (fieldErrors.progress) setFieldErrors((f) => ({ ...f, progress: "" }));
                }}
              />
              {fieldErrors.progress && <span className="vc-err">{fieldErrors.progress}</span>}
            </div>
            <div className="vc-field">
              <label className="vc-label">Start date</label>
              <input
                className="vc-input"
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createProject()}>
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
          emptyTitle={debounced || statusFilter ? "No matching projects" : "No projects yet"}
          emptyHint={debounced || statusFilter ? "Try clearing the search or status filter." : "Press Alt+N to create your first project."}
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
          title="Projects"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
