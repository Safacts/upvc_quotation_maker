"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Plus, Search, Download, RefreshCw } from "lucide-react";
import { DataGrid, StatusPill } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
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
  const { slug, toast } = useConsole();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [reloadKey, setReloadKey] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce the search box. Firing a request per keystroke would issue ~8
  // queries for "sharma" and, because responses can land out of order, let an
  // earlier partial-term result overwrite the final one.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  // Any filter change must reset to page 1. Staying on page 4 after filtering to
  // 12 results shows an empty grid and looks like data loss.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sorting]);

  useEffect(() => {
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
        setRows(data.rows || []);
        setTotalCount(data.total_count || 0);
        setTotalPages(data.total_pages || 1);
      } catch (e: any) {
        if (!cancelled) toast(String(e?.message ?? e), "err");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedSearch, statusFilter, sorting, reloadKey, toast]);

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

  useConsoleStatus({
    busy: loading,
    count: `${rows.length} of ${totalCount} quotations`,
    total: formatMoney(pageTotal) + " on this page",
    hints: [
      { keys: "↑↓", label: "Move" },
      { keys: "Enter", label: "Open" },
      { keys: "Ctrl+F", label: "Search" },
      { keys: "Alt+N", label: "New" },
      { keys: "Ctrl+E", label: "Export" },
    ],
  });

  const columns = useMemo<ColumnDef<Row, any>[]>(
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
        accessorKey: "grand_total",
        header: "Grand Total",
        enableSorting: false,
        meta: { align: "right" },
        cell: (c) => <b>{formatAmount(c.getValue())}</b>,
      },
    ],
    [],
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
          columns={columns}
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
    </div>
  );
}
