"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

/**
 * DataGrid — the shared TanStack Table v8 wrapper used by every console module.
 *
 * ============================================================================
 *  WHY TANSTACK TABLE v8 AND NOT AG GRID
 * ============================================================================
 *  Licence  TanStack is MIT. AG Grid puts grouping, pivot, Excel export and
 *           master-detail behind a PAID PER-DEVELOPER licence — not defensible
 *           for a bootstrapped shop selling at Rs. 25,000 per client.
 *  Bundle   ~14 kB headless vs ~300 kB+ for the AG Grid community build.
 *  Styling  Headless means it emits no CSS and cannot fight the 3,100 lines of
 *           hand-rolled stylesheets this repo already has.
 *  Keyboard THE decisive one. Our entire competitive premise is a bespoke Tally
 *           key map. AG Grid's value is its built-in interaction model — which
 *           is exactly the thing we would have to fight and override. Paying for
 *           a UX in order to replace it is the wrong trade.
 *
 * ============================================================================
 *  MANUAL EVERYTHING (`manualSorting` / `manualPagination`)
 * ============================================================================
 * The table is told NOT to sort or paginate client-side. It holds ONE page at a
 * time and the server does the work. Letting TanStack sort would sort only the
 * 50 rows currently loaded while the header claims the whole set is ordered —
 * a subtly wrong answer, which is worse than a slow one. `/api/console/quotations`
 * pushes sort+filter+page into PostgREST, and its `total_count` is the FILTERED
 * count so "showing 1-50 of N" describes the active filter.
 */

export interface DataGridProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  /** Stable row identity. Required for keyboard focus to survive a refetch. */
  getRowId: (row: T) => string;
  onRowActivate?: (row: T) => void;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  /** Height for the scroll container, e.g. "calc(100vh - 210px)". */
  maxHeight?: string;
}

export function DataGrid<T>({
  data,
  columns,
  getRowId,
  onRowActivate,
  sorting = [],
  onSortingChange,
  loading = false,
  emptyTitle = "Nothing here yet",
  emptyHint,
  maxHeight = "calc(100vh - 210px)",
}: DataGridProps<T>) {
  const [focusIndex, setFocusIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting: true,
    manualPagination: true,
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowId(row),
  });

  const rows = table.getRowModel().rows;

  // A refetch that returns fewer rows must not leave focus pointing past the
  // end — Enter would then activate nothing and the grid would feel dead.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const scrollFocusedIntoView = useCallback((index: number) => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`tr[data-idx="${index}"]`);
    // `nearest` rather than `center`: arrowing down a list should advance one
    // row, not jump the viewport around on every keypress.
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  /**
   * Grid keyboard model. Bound to the container, NOT to window — a global
   * ArrowDown listener would hijack the arrow keys inside the toolbar's search
   * box and inside every text field on the page.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!rows.length) return;
      const target = e.target as HTMLElement;
      const tag = (target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => {
          const next = Math.min(i + 1, rows.length - 1);
          scrollFocusedIntoView(next);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => {
          const next = Math.max(i - 1, 0);
          scrollFocusedIntoView(next);
          return next;
        });
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusIndex(0);
        scrollFocusedIntoView(0);
      } else if (e.key === "End") {
        e.preventDefault();
        const last = rows.length - 1;
        setFocusIndex(last);
        scrollFocusedIntoView(last);
      } else if (e.key === "Enter") {
        // Tally pillar #3: Enter drills down on any report row. Reports are
        // navigable trees, not dead-end exports.
        e.preventDefault();
        const row = rows[focusIndex];
        if (row && onRowActivate) onRowActivate(row.original);
      }
    },
    [rows, focusIndex, onRowActivate, scrollFocusedIntoView],
  );

  const colCount = table.getAllLeafColumns().length;

  return (
    <div
      className="vc-grid-wrap"
      style={{ maxHeight }}
      ref={wrapRef}
      // tabIndex makes the grid itself focusable so arrow keys work after a
      // click on the container rather than only after clicking a row.
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="grid"
    >
      <table className="vc-table">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort() && !!onSortingChange;
                const dir = sorting.find((s) => s.id === header.column.id);
                const align = (header.column.columnDef.meta as any)?.align;
                return (
                  <th
                    key={header.id}
                    className={
                      (align === "right" ? "vc-num " : "") + (canSort ? "vc-th-sortable" : "")
                    }
                    style={{ width: header.getSize() ? header.getSize() : undefined }}
                    onClick={
                      canSort
                        ? () => {
                            const isDesc = dir?.desc === true;
                            const isActive = !!dir;
                            // Cycle desc -> asc -> desc. No "unsorted" state:
                            // the server always applies an ORDER BY (it needs a
                            // deterministic one for offset paging), so offering
                            // an unsorted option would be a lie.
                            onSortingChange!([
                              { id: header.column.id, desc: isActive ? !isDesc : true },
                            ]);
                          }
                        : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {dir && <span className="vc-sort-ind">{dir.desc ? "▼" : "▲"}</span>}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading && rows.length === 0 && (
            <tr>
              <td colSpan={colCount} style={{ padding: 26, textAlign: "center" }}>
                <span className="vc-spinner" />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={colCount}>
                <div className="vc-empty">
                  <div className="vc-empty-title">{emptyTitle}</div>
                  {emptyHint && <div>{emptyHint}</div>}
                </div>
              </td>
            </tr>
          )}
          {rows.map((row, idx) => (
            <tr
              key={row.id}
              data-idx={idx}
              className={idx === focusIndex ? "vc-row-focus" : ""}
              onClick={() => setFocusIndex(idx)}
              onDoubleClick={() => onRowActivate?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => {
                const align = (cell.column.columnDef.meta as any)?.align;
                return (
                  <td key={cell.id} className={align === "right" ? "vc-num" : ""}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Status pill shared by the quotation grids. */
export function StatusPill({ status }: { status: string }) {
  // Lower-cased because the live table holds BOTH 'Draft' and 'draft' (verified
  // 08-08-2026). Without this the legacy rows fall through to an unstyled pill.
  const s = (status || "draft").toLowerCase();
  return <span className={`vc-pill vc-pill-${s}`}>{s}</span>;
}
