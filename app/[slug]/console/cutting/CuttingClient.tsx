"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, SlidersHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { ScreenConfigDialog } from "../_components/ScreenConfigDialog";
import { useScreenConfig } from "@/lib/hooks/useScreenConfig";
import type { ColumnSpec } from "@/lib/screen-config";
import { formatDate, toCsv, downloadFile } from "@/lib/console-format";

/** Ctrl+, column catalogue. Ids must match the accessorKeys below. */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "profile_type", label: "Profile", required: true },
  { id: "stock_length_mm", label: "Stock (mm)" },
  { id: "cut_count", label: "Cuts" },
  { id: "wastage_percent", label: "Wastage" },
  { id: "status", label: "Status" },
  { id: "created_at", label: "Added" },
];

const SCREEN_ID = "cutting";

const STATUSES = ["pending", "approved", "cutting", "completed"];

const STATUS_COLORS: Record<string, string> = {
  pending: "#8a94a1",
  approved: "#0891B2",
  cutting: "#EA580C",
  completed: "#16A34A",
};

interface Cut {
  piece_length_mm: number;
  quantity: number;
  label: string;
}

interface Row {
  id: string;
  order_id: string | null;
  production_order_id: string | null;
  profile_type: string;
  stock_length_mm: number;
  cuts: Cut[];
  optimized_cuts: Array<{ piece_length_mm: number; quantity: number; offcut_mm: number }>;
  wastage_percent: number;
  status: string;
  created_at: string;
}

/**
 * Cutting — first-fit-decreasing bin packing on the shop floor.
 *
 * Backed by `GET /api/console/cutting` for the list and `POST /api/console/cutting`
 * for the optimizer (the server runs the same FFD algorithm the Flutter app ships
 * with and returns `optimized_cuts` + `wastage_percent`). This screen lets an
 * operator enter required piece lengths and see the optimized arrangement and
 * wastage before approving a cutting list for the floor.
 */
export default function CuttingClient() {
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Row | null>(null);
  const [draft, setDraft] = useState({
    profile_type: "",
    stock_length_mm: "",
    cuts: [{ piece_length_mm: "", quantity: "1", label: "" }],
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
      if (debounced) params.set("profile_type", debounced);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/console/cutting?${params}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load cutting lists", "err");
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

  const setStatus = useCallback(
    async (row: Row, status: string) => {
      try {
        const res = await fetch(`/api/console/cutting/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not update status");
        toast(`Marked ${status}`, "ok");
        void load();
      } catch (e: any) {
        toast(String(e?.message ?? e), "err");
      }
    },
    [toast, load],
  );

  const createCuttingList = useCallback(async () => {
    if (!draft.profile_type.trim()) {
      toast("Profile type is required", "err");
      return;
    }
    const stock = Number(draft.stock_length_mm);
    if (!(stock > 0)) {
      toast("Stock length must be positive", "err");
      return;
    }
    const cuts = draft.cuts
      .filter((c) => c.piece_length_mm !== "")
      .map((c) => ({
        piece_length_mm: Number(c.piece_length_mm),
        quantity: Math.max(1, Number(c.quantity) || 1),
        label: c.label,
      }));
    if (cuts.length === 0) {
      toast("At least one cut is required", "err");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/console/cutting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          profile_type: draft.profile_type,
          stock_length_mm: stock,
          cuts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not create cutting list", "err");
        return;
      }
      const row: Row = data.cutting_list;
      setResult(row);
      toast(`Optimized — ${row.wastage_percent}% wastage`, "ok");
      setCreating(false);
      void load();
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    } finally {
      setBusy(false);
    }
  }, [draft, toast, load]);

  const updateCut = useCallback(
    (i: number, field: keyof (typeof draft.cuts)[number], value: string) => {
      setDraft((d) => {
        const cuts = d.cuts.map((c, idx) => (idx === i ? { ...c, [field]: value } : c));
        return { ...d, cuts };
      });
    },
    [],
  );

  const addCutRow = useCallback(() => {
    setDraft((d) => ({ ...d, cuts: [...d.cuts, { piece_length_mm: "", quantity: "1", label: "" }] }));
  }, []);

  const removeCutRow = useCallback((i: number) => {
    setDraft((d) => ({ ...d, cuts: d.cuts.filter((_, idx) => idx !== i) }));
  }, []);

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      ["Profile", "Stock (mm)", "Cuts", "Wastage %", "Status", "Added"],
      rows.map((r) => [
        r.profile_type,
        r.stock_length_mm,
        (r.cuts || []).reduce((s, c) => s + (Number(c.quantity) || 0), 0),
        r.wastage_percent,
        r.status,
        formatDate(r.created_at),
      ]),
    );
    downloadFile(`cutting-lists-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} cutting lists`, "ok");
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
    busy: loading || busy,
    count: `${rows.length} of ${totalCount} cutting lists`,
    hints: [
      { keys: "PgUp/PgDn", label: "Page" },
      { keys: "Ctrl+F", label: "Search" },
      { keys: "Alt+N", label: "Optimize" },
      { keys: "Ctrl+E", label: "Export" },
    ],
  });

  const allColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        accessorKey: "profile_type",
        header: "Profile",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      {
        accessorKey: "stock_length_mm",
        header: "Stock (mm)",
        meta: { align: "right" },
        cell: (c) => `${Number(c.getValue()) || 0} mm`,
      },
      {
        accessorKey: "cut_count",
        header: "Cuts",
        meta: { align: "right" },
        cell: (c) => (c.row.original.cuts || []).reduce((s, cut) => s + (Number(cut.quantity) || 0), 0),
      },
      {
        accessorKey: "wastage_percent",
        header: "Wastage",
        meta: { align: "right" },
        cell: (c) => {
          const w = Number(c.getValue()) || 0;
          return (
            <span
              style={{
                display: "inline-block",
                padding: "1px 7px",
                borderRadius: 20,
                fontSize: 10.5,
                fontWeight: 700,
                background: w > 10 ? "#fef2f2" : w > 5 ? "#fffbeb" : "#f0fdf4",
                color: w > 10 ? "#DC2626" : w > 5 ? "#CA8A04" : "#16A34A",
              }}
            >
              {w.toFixed(2)}%
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (c) => {
          const s = String(c.getValue() || "pending");
          return (
            <select
              className="vc-select"
              style={{ padding: "1px 4px", fontSize: 10.5, borderColor: "transparent" }}
              value={s}
              onChange={(e) => void setStatus(c.row.original, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Added",
        cell: (c) => formatDate(c.getValue()),
      },
    ],
    [setStatus],
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
              placeholder="Search profile type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search size={13} style={{ position: "absolute", left: 8, top: 8, color: "#8a94a1" }} />
          </div>

          <select
            className="vc-select"
            style={{ width: 130 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
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
            <Plus size={13} /> Optimize <span className="vc-kbd">Alt N</span>
          </button>
        </div>

        {/* ---- Optimizer form ---- */}
        {creating && (
          <div
            style={{
              padding: 11,
              borderBottom: "1px solid var(--vc-border)",
              background: "#FFEDD5",
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div className="vc-field">
                <label className="vc-label">
                  Profile type <span className="vc-req">*</span>
                </label>
                <input
                  className="vc-input"
                  style={{ width: 180 }}
                  value={draft.profile_type}
                  placeholder="e.g. 3925-60x45"
                  onChange={(e) => setDraft({ ...draft, profile_type: e.target.value })}
                />
              </div>
              <div className="vc-field">
                <label className="vc-label">
                  Stock length (mm) <span className="vc-req">*</span>
                </label>
                <input
                  className="vc-input vc-num"
                  style={{ width: 130 }}
                  inputMode="numeric"
                  value={draft.stock_length_mm}
                  onChange={(e) => setDraft({ ...draft, stock_length_mm: e.target.value })}
                />
              </div>
              <button type="button" className="vc-btn vc-btn-sm" onClick={addCutRow}>
                <Plus size={12} /> Add cut
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createCuttingList()} disabled={busy}>
                {busy ? <span className="vc-spinner" /> : "Optimize"}
              </button>
              <button type="button" className="vc-btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              {draft.cuts.map((cut, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 16, fontSize: 11, color: "#7C2D12" }}>{i + 1}</span>
                  <input
                    className="vc-input vc-num"
                    style={{ width: 110 }}
                    inputMode="numeric"
                    placeholder="Length mm"
                    value={cut.piece_length_mm}
                    onChange={(e) => updateCut(i, "piece_length_mm", e.target.value)}
                  />
                  <input
                    className="vc-input vc-num"
                    style={{ width: 80 }}
                    inputMode="numeric"
                    placeholder="Qty"
                    value={cut.quantity}
                    onChange={(e) => updateCut(i, "quantity", e.target.value)}
                  />
                  <input
                    className="vc-input"
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder="Label (optional)"
                    value={cut.label}
                    onChange={(e) => updateCut(i, "label", e.target.value)}
                  />
                  <button
                    type="button"
                    className="vc-icon-btn"
                    disabled={draft.cuts.length <= 1}
                    onClick={() => removeCutRow(i)}
                    title="Remove cut"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Optimizer result ---- */}
        {result && (
          <div
            style={{
              margin: 10,
              border: "1px solid #fda4af",
              borderRadius: 6,
              background: "#fff7ed",
              padding: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: "#7C2D12" }}>
                Optimized layout · {result.profile_type} · {result.stock_length_mm} mm stock
              </span>
              <span
                style={{
                  padding: "1px 8px",
                  borderRadius: 20,
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: result.wastage_percent > 10 ? "#fef2f2" : "#f0fdf4",
                  color: result.wastage_percent > 10 ? "#DC2626" : "#16A34A",
                }}
              >
                {result.wastage_percent.toFixed(2)}% wastage
              </span>
              <div style={{ flex: 1 }} />
              <button type="button" className="vc-btn vc-btn-sm" onClick={() => setResult(null)}>
                Dismiss
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(result.optimized_cuts || []).map((oc, i) => (
                <span
                  key={i}
                  style={{
                    border: "1px solid var(--vc-border-strong)",
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 11.5,
                    background: "#fff",
                  }}
                >
                  {oc.piece_length_mm} mm × {oc.quantity}
                  {oc.offcut_mm > 0 && (
                    <span style={{ color: "#CA8A04" }}> · offcut {oc.offcut_mm} mm</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <DataGrid<Row>
          data={rows}
          columns={columns}
          density={screen.config.density}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle={debounced || statusFilter ? "No matching cutting lists" : "No cutting lists yet"}
          emptyHint={debounced || statusFilter ? "Try clearing the search or status filter." : "Press Alt+N to optimize a set of cuts."}
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
          title="Cutting"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
