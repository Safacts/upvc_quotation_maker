"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Plus, Search, Download, RefreshCw, SlidersHorizontal, Cuboid } from "lucide-react";
import { DataGrid, StatusPill } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { ScreenConfigDialog } from "../_components/ScreenConfigDialog";
import { useScreenConfig } from "@/lib/hooks/useScreenConfig";
import { filterSignature, saveCursor } from "@/lib/record-nav";
import { applyPeriodParams, describePeriod } from "@/lib/period";
import type { ColumnSpec } from "@/lib/screen-config";
import {
  formatAmount,
  formatDate,
  formatMoney,
  formatSqft,
  toCsv,
  downloadFile,
} from "@/lib/console-format";
import { QUOTATION_STATUSES } from "@/lib/console-schemas";

/**
 * Column catalogue for Ctrl+, (the column chooser).
 *
 * Ids MUST match the `accessorKey` of the TanStack columns below — that is what
 * `applyConfigToColumns` matches on, and a typo means a column that can never
 * be shown. `customer_name` is `required` because a quotation list without the
 * customer is not a customisation, it is a broken screen.
 */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "quote_no", label: "Quote No" },
  { id: "customer_name", label: "Customer", required: true },
  { id: "contact_no", label: "Phone" },
  { id: "date", label: "Date" },
  { id: "status", label: "Status" },
  { id: "item_count", label: "Items" },
  { id: "total_sqft", label: "Sqft" },
  { id: "net_total", label: "Net" },
  // Off by default: GST is only meaningful for the subset of quotes that carry
  // it, and an always-zero column is noise on the screen people live in.
  { id: "gst_amount", label: "GST", defaultHidden: true },
  { id: "grand_total", label: "Grand Total" },
  { id: "actions", label: "3D", required: true },
];

const SCREEN_ID = "quotations";

/**
 * Quotations grid — server-paged, server-sorted, server-filtered.
 *
 * The grid NEVER holds more than one page. `/api/portal_stats` is the
 * cautionary tale in this repo: it pulls the entire quotations table with both
 * child tables embedded and aggregates in a JS loop. That is fine at 49 rows and
 * fatal at 5,000, and a grid built on that pattern would take the whole console
 * down with it.
 */

interface Row {
  id: string;
  quote_no: string;
  date: string;
  customer_name: string;
  contact_no: string;
  status: string;
  created_at: string;
  item_count: number;
  total_sqft: number;
  net_total: number;
  gst_amount: number;
  grand_total: number;
}

export default function QuotationsClient() {
  const router = useRouter();
  const { slug, clientId, toast, period, openQuickCreate } = useConsole();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [reloadKey, setReloadKey] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);

  // Ctrl+, — column visibility/order, density and page size, persisted per
  // tenant + screen. `ready` gates the first fetch so a user configured for 200
  // rows does not get a wasted 50-row request first.
  const screen = useScreenConfig(clientId, SCREEN_ID, COLUMN_SPECS);
  const pageSize = screen.config.pageSize;

  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce the search box. Firing a request per keystroke would issue ~8
  // queries for "sharma" and, because responses can land out of order, let an
  // earlier partial-term result overwrite the final one.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  // Any filter change must reset to page 1. Staying on page 4 after filtering to
  // 12 results shows an empty grid and looks like data loss. The PERIOD counts
  // as a filter — changing it with F2 while on page 6 has the same problem.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sorting, period.from, period.to, pageSize]);

  useEffect(() => {
    // Wait for the stored page size before the first request — see useScreenConfig.
    if (!screen.ready) return;

    let cancelled = false;
    setLoading(true);

    const sort = sorting[0]?.id || "created_at";
    const dir = sorting[0]?.desc === false ? "asc" : "desc";
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort,
      dir,
    });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    // F2's period. `from`/`to` are half-open and already in the exact form the
    // API expects — see src/lib/period.ts.
    applyPeriodParams(params, period);

    (async () => {
      try {
        const res = await fetch(`/api/console/quotations?${params}`, {
          credentials: "same-origin",
        });
        const data = await res.json();
        // `cancelled` guards against the out-of-order response problem: a slow
        // page-1 request resolving after a fast page-2 one would otherwise
        // repaint the grid with stale rows.
        if (cancelled) return;
        if (!res.ok) {
          toast(data?.error || "Failed to load quotations", "err");
          setRows([]);
          return;
        }
        const loaded: Row[] = data.rows || [];
        setRows(loaded);
        setTotalCount(data.total_count || 0);
        setTotalPages(data.total_pages || 1);

        // Publish the PgUp/PgDn rail for the editor. This is the handoff that
        // lets a user open one quotation and walk the whole filtered list with
        // one key, never returning here. It is a navigation hint only — every
        // id is still re-authorised server-side. See src/lib/record-nav.ts.
        saveCursor(clientId, SCREEN_ID, {
          ids: loaded.map((r) => r.id),
          page,
          totalPages: data.total_pages || 1,
          totalCount: data.total_count || 0,
          signature: filterSignature({
            q: debouncedSearch,
            status: statusFilter,
            sort,
            dir,
            from: period.from,
            to: period.to,
            pageSize,
          }),
        });
      } catch (e: any) {
        if (!cancelled) toast(String(e?.message ?? e), "err");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    page, pageSize, debouncedSearch, statusFilter, sorting, reloadKey, toast,
    period.from, period.to, clientId, screen.ready,
  ]);

  const pageTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.net_total) || 0), 0),
    [rows],
  );

  const openRow = useCallback(
    (row: Row) => router.push(`/${slug}/console/quotations/${row.id}`),
    [router, slug],
  );

  /**
   * CSV export covers the CURRENT PAGE only, and the filename says so.
   *
   * Exporting the full filtered set means looping the API server-side, which is
   * a Phase 2 chunked-export job (the Vercel function has a 10s wall clock).
   * Silently exporting 50 of 500 rows under a filename that implies "everything"
   * is how an accountant files an incomplete return.
   */
  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      [
        "Quote No",
        "Date",
        "Customer",
        "Phone",
        "Status",
        "Items",
        "Sqft",
        "Net Total",
        "GST",
        "Grand Total",
      ],
      rows.map((r) => [
        r.quote_no,
        formatDate(r.date || r.created_at),
        r.customer_name,
        r.contact_no,
        r.status,
        r.item_count,
        r.total_sqft.toFixed(2),
        r.net_total.toFixed(2),
        r.gst_amount.toFixed(2),
        r.grand_total.toFixed(2),
      ]),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`quotations-page${page}-${stamp}.csv`, csv);
    toast(`Exported ${rows.length} rows (page ${page})`, "ok");
  }, [rows, page, toast]);

  useConsoleAction("export", exportCsv);
  useConsoleAction("new", () => router.push(`/${slug}/console/quotations/new`));
  // Ctrl+F. select() as well as focus() so a second press replaces the previous
  // term instead of appending to it — the common case is a new search, not an
  // edit of the old one.
  useConsoleAction("search", () => {
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    el.select();
  });

  // Ctrl+, — this screen's column chooser.
  useConsoleAction("config", () => setConfigOpen(true));

  // Alt+C from a list screen means "add a customer", not "add a product":
  // there is no item grid here to imply otherwise.
  useConsoleAction("quickCreate", () => openQuickCreate("customer", search.trim()));

  /**
   * PgUp / PgDn on a LIST mean previous/next PAGE.
   *
   * There is no open record here, so "next record" degenerates to "next page" —
   * the same intent (show me the neighbouring data) resolved for this screen.
   * In the editor the identical keys move between quotations. Guarded on
   * `loading` so holding the key does not queue a stack of requests.
   */
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
    count: `${rows.length} of ${totalCount} quotations · ${describePeriod(period)}`,
    total: formatMoney(pageTotal) + " on this page",
    hints: [
      { keys: "↑↓", label: "Move" },
      { keys: "Enter", label: "Open" },
      { keys: "PgUp/PgDn", label: "Page" },
      { keys: "Ctrl+F", label: "Search" },
      { keys: "F2", label: "Period" },
      { keys: "Alt+N", label: "New" },
      { keys: "Ctrl+," , label: "Columns" },
      { keys: "Ctrl+E", label: "Export" },
    ],
  });

  const allColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        accessorKey: "quote_no",
        header: "Quote No",
        cell: (c) => (
          <span style={{ fontFamily: "var(--vc-mono)", fontSize: 11.5 }}>
            {c.getValue() || "—"}
          </span>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      { accessorKey: "contact_no", header: "Phone", enableSorting: false },
      {
        accessorKey: "date",
        header: "Date",
        cell: (c) => formatDate(c.getValue() || c.row.original.created_at),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (c) => <StatusPill status={c.getValue()} />,
      },
      {
        accessorKey: "item_count",
        header: "Items",
        enableSorting: false,
        meta: { align: "right" },
      },
      {
        accessorKey: "total_sqft",
        header: "Sqft",
        // Money and area columns are computed from line items, so PostgREST
        // cannot ORDER BY them. Marking them unsortable is honest; sorting the
        // 50 loaded rows while the header implies the whole set is ordered is
        // not. Restored when migration 010's `search_quotations` goes live.
        enableSorting: false,
        meta: { align: "right" },
        cell: (c) => formatSqft(c.getValue()),
      },
      {
        accessorKey: "net_total",
        header: "Net",
        enableSorting: false,
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      {
        accessorKey: "gst_amount",
        header: "GST",
        enableSorting: false,
        meta: { align: "right" },
        cell: (c) => formatAmount(c.getValue()),
      },
      {
        accessorKey: "grand_total",
        header: "Grand Total",
        enableSorting: false,
        meta: { align: "right" },
        cell: (c) => <b>{formatAmount(c.getValue())}</b>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "center" },
        cell: (c) => (
          <button
            type="button"
            className="vc-btn vc-btn-sm"
            title="Open the first measured opening as a 3D model"
            onClick={(e) => {
              e.stopPropagation();
              window.open(
                `/upvc/3d-viewer?fromQuotation=${c.row.original.id}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            <Cuboid size={12} /> 3D
          </button>
        ),
      },
    ],
    [],
  );

  // Ctrl+, applied: filter to the visible set and put them in the saved order.
  const visibleColumns = useMemo(
    () => screen.applyTo(allColumns),
    [allColumns, screen],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="vc-card" style={{ margin: 10, borderRadius: 6, overflow: "hidden" }}>
        <div className="vc-toolbar">
          <div className="vc-search">
            <input
              ref={searchRef}
              className="vc-input"
              style={{ paddingLeft: 27 }}
              placeholder="Search customer, quote no, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 8,
                top: 8,
                color: "#8a94a1",
                pointerEvents: "none",
              }}
            />
          </div>

          <select
            className="vc-select"
            style={{ width: 130 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {QUOTATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="vc-btn"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Refresh"
          >
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
            <Download size={13} /> CSV <span className="vc-kbd">Ctrl E</span>
          </button>
          <button
            type="button"
            className="vc-btn vc-btn-primary"
            onClick={() => router.push(`/${slug}/console/quotations/new`)}
          >
            <Plus size={13} /> New <span className="vc-kbd">Alt N</span>
          </button>
        </div>

        <DataGrid<Row>
          data={rows}
          columns={visibleColumns}
          density={screen.config.density}
          getRowId={(r) => r.id}
          onRowActivate={openRow}
          sorting={sorting}
          onSortingChange={setSorting}
          loading={loading}
          emptyTitle={debouncedSearch || statusFilter ? "No matching quotations" : "No quotations yet"}
          emptyHint={
            debouncedSearch || statusFilter
              ? "Try clearing the search or status filter."
              : "Press Alt+N to create your first one."
          }
          maxHeight="calc(100vh - 200px)"
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
          title="Quotations"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
