"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, SlidersHorizontal } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { ScreenConfigDialog } from "../_components/ScreenConfigDialog";
import { useScreenConfig } from "@/lib/hooks/useScreenConfig";
import type { ColumnSpec } from "@/lib/screen-config";
import { formatDate, toCsv, downloadFile } from "@/lib/console-format";

/** Ctrl+, column catalogue. Ids must match the accessorKeys below. */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "name", label: "Name", required: true },
  { id: "phone", label: "Phone" },
  { id: "company", label: "Company" },
  { id: "email", label: "Email" },
  // Most fabricators quote unregistered retail customers; GSTIN is empty for
  // the majority of rows, so it stays off until asked for.
  { id: "gst_number", label: "GSTIN", defaultHidden: true },
  { id: "created_at", label: "Added" },
];

const SCREEN_ID = "customers";

/**
 * Customers master grid.
 *
 * Backed by the `customers` table from migration 007 (applied and live —
 * verified against the REST API on 08-08-2026, returns 200 with rows).
 *
 * Note what this screen does NOT do: it does not replace `quotations.customer_name`
 * / `contact_no`. Those columns stay as an immutable historical snapshot of what
 * was printed on each PDF. If a customer changes their phone number, last year's
 * quotation must still show the number that was actually on it — so
 * `quotations.customer_id` is an ADDITIVE, nullable link, never a substitute.
 */

interface Row {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  gst_number: string;
  created_at: string;
}

export default function CustomersClient() {
  const router = useRouter();
  const { slug, clientId, toast } = useConsole();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [creating, setCreating] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", company: "" });

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
      const res = await fetch(`/api/console/customers?${params}`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Failed to load customers", "err");
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

  const createCustomer = useCallback(async () => {
    if (!draft.name.trim()) {
      toast("Name is required", "err");
      return;
    }
    try {
      const res = await fetch("/api/console/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not save customer", "err");
        return;
      }
      // The API returns the EXISTING row rather than a 409 when the phone
      // already belongs to a customer — duplicate phones are the normal case
      // for a repeat customer, not an error to shout about.
      toast(data.existing ? "Customer already existed" : "Customer added", "ok");
      setCreating(false);
      setDraft({ name: "", phone: "", email: "", company: "" });
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
      ["Name", "Phone", "Email", "Company", "Address", "GSTIN", "Added"],
      rows.map((r) => [
        r.name,
        r.phone,
        r.email,
        r.company,
        r.address,
        r.gst_number,
        formatDate(r.created_at),
      ]),
    );
    downloadFile(`customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} customers`, "ok");
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
  // Alt+C on the customers screen opens the same inline row the New button
  // does — a modal on top of a screen whose whole job is creating customers
  // would be a dialog for the sake of consistency, not usability.
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
    count: `${rows.length} of ${totalCount} customers`,
    hints: [
      { keys: "↑↓", label: "Move" },
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
        header: "Name",
        cell: (c) => <span style={{ fontWeight: 600 }}>{c.getValue() || "—"}</span>,
      },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "company", header: "Company" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "gst_number", header: "GSTIN" },
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
              placeholder="Search name, phone, company..."
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
              gridTemplateColumns: "repeat(4, minmax(0,1fr)) auto",
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
                onKeyDown={(e) => e.key === "Enter" && void createCustomer()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Phone</label>
              <input
                className="vc-input"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createCustomer()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Company</label>
              <input
                className="vc-input"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createCustomer()}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">Email</label>
              <input
                className="vc-input"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void createCustomer()}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createCustomer()}>
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
          onRowActivate={(r) =>
            // Drill down: open the quotations grid filtered to this customer's
            // name. Tally pillar #3 — Enter on any row goes somewhere useful.
            router.push(
              `/${slug}/console/quotations?q=${encodeURIComponent(r.phone || r.name)}`,
            )
          }
          loading={loading}
          emptyTitle={debounced ? "No matching customers" : "No customers yet"}
          emptyHint={
            debounced
              ? "Try a different search."
              : "Press Alt+N to add one, or they will appear as you create quotations."
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
          title="Customers"
          columns={COLUMN_SPECS}
          config={screen.config}
          onChange={screen.setConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
