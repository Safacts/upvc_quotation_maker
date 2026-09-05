"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Copy,
  CheckCircle2,
  Phone,
  Download,
  AlertTriangle,
  Clock,
  Users,
  Wallet,
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatMoney, toCsv, downloadFile } from "@/lib/console-format";

function WhatsAppIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type Row = {
  customer_id: string | null;
  customer_name: string;
  outstanding: number;
  overdue: number;
  last_invoice?: string;
  phone?: string;
};

export default function MoneyClient() {
  const { toast } = useConsole();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "current">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/console/payments/overdue", {
        credentials: "same-origin",
      });
      const j = await r.json().catch(() => null);
      if (r.ok && Array.isArray(j?.rows)) {
        setRows(j.rows);
      } else {
        // Fallback: aggregate live quotations
        const q2 = await fetch("/api/console/quotations?page_size=200", {
          credentials: "same-origin",
        });
        const j2 = await q2.json().catch(() => null);
        const list = Array.isArray(j2?.rows)
          ? j2.rows
          : Array.isArray(j2)
            ? j2
            : [];
        const map = new Map<string, Row>();
        for (const qq of list) {
          const k = (qq.customer_name || "Walk-in").trim();
          const amt = Number(qq.grand_total ?? qq.net_total ?? 0);
          const paid = qq.status === "won" ? 0 : amt;
          if (!map.has(k)) {
            map.set(k, {
              customer_name: k,
              customer_id: qq.customer_id,
              outstanding: 0,
              overdue: 0,
            });
          }
          map.get(k)!.outstanding += paid;
          map.get(k)!.overdue +=
            paid &&
            qq.created_at &&
            (Date.now() - new Date(qq.created_at).getTime()) / 86400000 > 30
              ? paid
              : 0;
          map.get(k)!.phone = qq.contact_no;
        }
        setRows(
          Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding),
        );
      }
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === "overdue") {
      list = list.filter((r) => r.overdue > 0);
    } else if (statusFilter === "current") {
      list = list.filter((r) => r.overdue <= 0);
    }

    if (!q.trim()) return list;
    const query = q.toLowerCase();
    return list.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(query) ||
        (r.phone && r.phone.includes(query)),
    );
  }, [rows, q, statusFilter]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + r.outstanding, 0),
    [rows],
  );

  const overdueTotal = useMemo(
    () => rows.reduce((s, r) => s + r.overdue, 0),
    [rows],
  );

  const currentTotal = useMemo(
    () => Math.max(0, total - overdueTotal),
    [total, overdueTotal],
  );

  const overdueCount = useMemo(
    () => rows.filter((r) => r.overdue > 0).length,
    [rows],
  );

  const exportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast("No accounts to export", "info");
      return;
    }
    const csv = toCsv(
      ["Customer Name", "Contact Phone", "Current (Rs.)", "Overdue >30d (Rs.)", "Total Outstanding (Rs.)", "Status"],
      filtered.map((r) => [
        r.customer_name,
        r.phone || "",
        Math.max(0, r.outstanding - r.overdue).toFixed(2),
        r.overdue.toFixed(2),
        r.outstanding.toFixed(2),
        r.overdue > 0 ? "Overdue" : "Current",
      ]),
    );
    downloadFile(`receivables-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${filtered.length} customer accounts`, "ok");
  }, [filtered, toast]);

  // Status bar integration
  useConsoleStatus({
    count: `${filtered.length} debtors`,
    total: `Total: ${formatMoney(total)} (Overdue: ${formatMoney(overdueTotal)})`,
    hints: [
      { keys: "Ctrl+F", label: "Search Customer" },
      { keys: "Ctrl+E", label: "Export CSV" },
      { keys: "F5", label: "Refresh Receivables" },
    ],
  });

  useConsoleAction("search", () => {
    document.getElementById("money-search-input")?.focus();
  });

  useConsoleAction("export", exportCsv);

  function reminderText(r: Row) {
    return `Hello ${r.customer_name}, your outstanding with us is ${formatMoney(r.outstanding)}${r.overdue ? ` (overdue >30d: ${formatMoney(r.overdue)})` : ""}. Kindly arrange payment at your earliest convenience. Thank you — ${new Date().toLocaleDateString("en-IN")}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Top Metrics Cards - Standard Console Summary Tiles */}
      <div className="vc-reports-summary">
        <div className="vc-summary-tile">
          <div className="vc-summary-tile-label">Total Receivables</div>
          <div className="vc-summary-tile-value vc-tone-accent">
            {formatMoney(total)}
          </div>
          <div className="vc-summary-tile-sub vc-muted">
            <Users size={11} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }} />
            {rows.length} customer accounts
          </div>
        </div>

        <div className="vc-summary-tile" style={{ borderLeft: "3px solid var(--vc-red, #c62828)" }}>
          <div className="vc-summary-tile-label" style={{ color: "var(--vc-red, #c62828)" }}>
            Overdue (&gt; 30 Days)
          </div>
          <div className="vc-summary-tile-value vc-tone-err">
            {formatMoney(overdueTotal)}
          </div>
          <div className="vc-summary-tile-sub vc-tone-err">
            <AlertTriangle size={11} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }} />
            {overdueCount} accounts require collection follow-up
          </div>
        </div>

        <div className="vc-summary-tile">
          <div className="vc-summary-tile-label">Current (&lt; 30 Days)</div>
          <div className="vc-summary-tile-value vc-tone-ok">
            {formatMoney(currentTotal)}
          </div>
          <div className="vc-summary-tile-sub vc-tone-ok">
            <Clock size={11} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }} />
            Within normal payment terms
          </div>
        </div>

        <div className="vc-summary-tile">
          <div className="vc-summary-tile-label">Collection Health</div>
          <div className="vc-summary-tile-value">
            {total > 0 ? `${Math.round(((total - overdueTotal) / total) * 100)}%` : "100%"}
          </div>
          <div className="vc-summary-tile-sub vc-muted">
            <Wallet size={11} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }} />
            {rows.length - overdueCount} accounts in good standing
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="vc-card">
        {/* Toolbar */}
        <div className="vc-toolbar">
          <div className="vc-search">
            <Search size={13} className="vc-search-icon" />
            <input
              id="money-search-input"
              className="vc-input"
              placeholder="Filter customer name or phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className={`vc-btn vc-btn-sm ${statusFilter === "all" ? "vc-btn-primary" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({rows.length})
            </button>
            <button
              type="button"
              className={`vc-btn vc-btn-sm ${statusFilter === "overdue" ? "vc-btn-primary" : ""}`}
              onClick={() => setStatusFilter("overdue")}
              style={{ color: statusFilter !== "overdue" && overdueCount > 0 ? "var(--vc-red)" : undefined }}
            >
              Overdue ({overdueCount})
            </button>
            <button
              type="button"
              className={`vc-btn vc-btn-sm ${statusFilter === "current" ? "vc-btn-primary" : ""}`}
              onClick={() => setStatusFilter("current")}
            >
              Current ({rows.length - overdueCount})
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={exportCsv}
              title="Export filtered records to CSV (Ctrl+E)"
            >
              <Download size={12} /> Export CSV <span className="vc-kbd">Ctrl E</span>
            </button>
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => void load()}
              disabled={loading}
              title="Refresh receivables data (F5)"
            >
              <RefreshCw size={12} className={loading ? "vc-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="vc-grid-wrap" style={{ maxHeight: "calc(100vh - 270px)" }}>
          <table className="vc-table">
            <thead>
              <tr>
                <th style={{ width: 240 }}>Customer Name</th>
                <th style={{ width: 140 }}>Contact Phone</th>
                <th className="vc-num" style={{ width: 130 }}>Current (&lt;30d)</th>
                <th className="vc-num" style={{ width: 130 }}>Overdue (&gt;30d)</th>
                <th className="vc-num" style={{ width: 150 }}>Total Outstanding</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 190, textAlign: "right" }}>Collection Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <div className="vc-empty">
                      <span className="vc-spinner" />
                      <div style={{ marginTop: 8 }}>Loading accounts receivable...</div>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <div className="vc-empty">
                      <CheckCircle2 size={32} style={{ margin: "0 auto 8px", color: "var(--vc-green)" }} />
                      <div className="vc-empty-title">
                        {q || statusFilter !== "all" ? "No matching accounts found" : "All accounts clear"}
                      </div>
                      <div>
                        {q || statusFilter !== "all"
                          ? "Try adjusting your search query or status filter."
                          : "Zero outstanding receivables across active customer accounts."}
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((r, i) => {
                  const hasOverdue = r.overdue > 0;
                  const currentAmt = Math.max(0, r.outstanding - r.overdue);
                  const cleanPhone = (r.phone || "").replace(/\D/g, "");
                  const waNumber = cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone;

                  return (
                    <tr key={r.customer_id || r.customer_name || i}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--vc-text)" }}>
                          {r.customer_name}
                        </div>
                      </td>
                      <td style={{ color: "var(--vc-text-dim)" }}>
                        {r.phone ? (
                          <a
                            href={`tel:${r.phone}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            <Phone size={11} /> {r.phone}
                          </a>
                        ) : (
                          <span style={{ color: "var(--vc-text-faint)" }}>—</span>
                        )}
                      </td>
                      <td className="vc-num" style={{ color: "var(--vc-text)" }}>
                        {formatMoney(currentAmt)}
                      </td>
                      <td
                        className="vc-num"
                        style={{
                          fontWeight: hasOverdue ? 700 : 400,
                          color: hasOverdue ? "var(--vc-red, #c62828)" : "var(--vc-text-faint)",
                        }}
                      >
                        {formatMoney(r.overdue)}
                      </td>
                      <td
                        className="vc-num"
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: hasOverdue ? "var(--vc-red, #c62828)" : "var(--vc-accent, #d89b25)",
                        }}
                      >
                        {formatMoney(r.outstanding)}
                      </td>
                      <td>
                        {hasOverdue ? (
                          <span className="vc-pill vc-pill-lost">Overdue</span>
                        ) : (
                          <span className="vc-pill vc-pill-won">Current</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 5, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="vc-btn vc-btn-sm"
                            onClick={() => {
                              void navigator.clipboard.writeText(reminderText(r));
                              toast("Reminder copied to clipboard", "ok");
                            }}
                            title="Copy payment reminder message"
                          >
                            <Copy size={11} /> Copy
                          </button>
                          {cleanPhone ? (
                            <a
                              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(reminderText(r))}`}
                              target="_blank"
                              rel="noreferrer"
                              className="vc-btn vc-btn-sm"
                              style={{ color: "var(--vc-green)", borderColor: "var(--vc-green-dim)" }}
                              title="Send payment reminder on WhatsApp"
                            >
                              <WhatsAppIcon size={12} /> WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
