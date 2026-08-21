"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, SlidersHorizontal } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { ScreenConfigDialog } from "../_components/ScreenConfigDialog";
import { useScreenConfig } from "@/lib/hooks/useScreenConfig";
import type { ColumnSpec } from "@/lib/screen-config";
import { formatAmount, formatDate, toCsv, downloadFile } from "@/lib/console-format";

/** Ctrl+, column catalogue. Ids must match the accessorKeys below. */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "name", label: "Product", required: true },
  { id: "category", label: "Category" },
  { id: "description", label: "Description" },
  { id: "price", label: "Rate" },
  { id: "unit", label: "Unit" },
  { id: "created_at", label: "Added", defaultHidden: true },
];

const SCREEN_ID = "products";

/**
 * Products / rate card.
 *
 * This is a RATE CARD, not stock control — deliberately. A product master with
 * default rates feeds line-item autocomplete and bulk rate revision for about a
 * day's work. Real inventory (GRN, issue, valuation) is 2+ weeks and a different
 * product; it is explicitly out of scope.
 *
 * `category` is free text with autocomplete over the values already in use,
 * rather than an enum. KPR will invent categories we did not anticipate, and an
 * enum turns each one into a database migration the user has to wait for.
 */

interface Row {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  unit: string;
  created_at: string;
}

export default function ProductsClient() {
  const { clientId, toast } = useConsole();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    category: "",
    description: "",
    price: "",
    unit: "SFT",
  });

  const [configOpen, setConfigOpen] = useState(false);
  const screen = useScreenConfig(clientId, SCREEN_ID, COLUMN_SPECS);
  const pageSize = screen.config.pageSize;

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, pageSize]);

  const load = useCallback(async () => {
    // Wait for the stored page size, or the first visit fires twice.
    if (!screen.ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debounced) params.set("q", debounced);
      const res = await fetch(`/api/console/products?${params}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load products", "err");
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
  }, [page, pageSize, debounced, toast, screen.ready]);

  useEffect(() => {
    void load();
  }, [load]);

  // Autocomplete source: the categories this tenant already uses. Derived from
  // the loaded page rather than a separate DISTINCT query — at rate-card sizes
  // (tens of rows) a round trip for this would be pure overhead.
  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(),
    [rows],
  );

  const createProduct = useCallback(async () => {
    if (!draft.name.trim()) {
      toast("Name is required", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not save product", "err");
        return;
      }
      toast("Product added", "ok");
      setCreating(false);
      setDraft({ name: "", category: "", description: "", price: "", unit: "SFT" });
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
      ["Name", "Category", "Description", "Rate", "Unit", "Added"],
      rows.map((r) => [
        r.name,
        r.category,
        r.description,
        Number(r.price || 0).toFixed(2),
        r.unit,
        formatDate(r.created_at),
      ]),
    );
    downloadFile(`rate-card-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} products`, "ok");
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
    count: `${rows.length} of ${totalCount} products`,
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
        header: "Product",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      { accessorKey: "category", header: "Category" },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "price",
        header: "Rate",
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      { accessorKey: "unit", header: "Unit" },
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
              placeholder="Search product, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search
              size={13}
              style={{ position: "absolute", left: 8, top: 8, color: "#8a94a1" }}
            />
          </div>
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
          <button
            type="button"
            className="vc-btn vc-btn-primary"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus size={13} /> New <span className="vc-kbd">Alt N</span>
          </button>
        </div>

        {creating && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1.6fr 0.8fr 0.6fr auto",
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
                onKeyDown={(e) => e.key === "Enter" && void createProduct()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Category</label>
              <input
                className="vc-input"
                list="vc-categories"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <datalist id="vc-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="vc-field">
              <label className="vc-label">Description</label>
              <input
                className="vc-input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createProduct()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Rate</label>
              <input
                className="vc-input vc-num"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createProduct()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Unit</label>
              <input
                className="vc-input"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createProduct()}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createProduct()}>
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
          emptyTitle={debounced ? "No matching products" : "Your rate card is empty"}
          emptyHint={
            debounced
              ? "Try a different search."
              : "Add the items you quote most often — they become one-click line items."
          }
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
          title="Products"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
