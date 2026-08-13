"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, TrendingUp, TrendingDown, Trophy, Clock } from "lucide-react";
import { useConsole, useConsoleStatus } from "./ConsoleShell";
import {
  formatMoneyCompact,
  formatMoney,
  formatRelative,
  formatSqft,
} from "@/lib/console-format";
import { StatusPill } from "./_components/DataGrid";

/**
 * Overview — the KPI screen.
 *
 * Every figure here comes from `/api/console/stats`, which computes with
 * `src/lib/pricing.ts`. No arithmetic happens in this file beyond picking which
 * pre-computed field to show. That rule is why the three surfaces (mobile PDF,
 * lite portal, console) now agree; a "quick" inline calculation here is exactly
 * how they drifted the first time.
 */

interface Stats {
  totalCount: number;
  scannedCount: number;
  truncated: boolean;
  counts: Record<string, number>;
  totalNet: number;
  totalGrand: number;
  totalGst: number;
  totalSqft: number;
  wonNet: number;
  wonCount: number;
  winRate: number;
  thisMonthNet: number;
  lastMonthNet: number;
  monthChangePercent: number;
  avgQuoteValue: number;
  weeklyBars: Array<{ label: string; amount: number; count: number }>;
  pendingFollowUps: Array<{
    id: string;
    quote_no: string;
    customer_name: string;
    contact_no: string;
    created_at: string;
    status: string;
    net_total: number;
  }>;
}

export default function OverviewClient() {
  const router = useRouter();
  const { slug, toast } = useConsole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/console/stats", { credentials: "same-origin" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Failed to load");
        } else {
          setStats(data);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useConsoleStatus({
    busy: loading,
    count: stats ? `${stats.totalCount} quotations` : undefined,
    total: stats ? formatMoney(stats.totalNet) + " quoted" : undefined,
    hints: [
      { keys: "Alt+N", label: "New" },
      { keys: "Ctrl+K", label: "Go To" },
      { keys: "?", label: "Shortcuts" },
    ],
  });

  // Bars are scaled against the largest bucket, not a fixed ceiling — with a
  // fixed max, a quiet month renders as eight invisible slivers.
  const maxBar = useMemo(() => {
    if (!stats?.weeklyBars?.length) return 1;
    return Math.max(1, ...stats.weeklyBars.map((w) => w.amount));
  }, [stats]);

  if (loading) {
    return (
      <div className="vc-pad">
        <div className="vc-empty">
          <span className="vc-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vc-pad">
        <div className="vc-card" style={{ padding: 18 }}>
          <div className="vc-empty-title">Could not load your figures</div>
          <div style={{ color: "#5b6673", fontSize: 12.5 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const up = stats.monthChangePercent >= 0;

  return (
    <div className="vc-pad">
      {/* Truncation is surfaced, never hidden. Reporting a partial aggregate as
          if it were the lifetime total is the failure mode this caption exists
          to prevent. In practice it never fires — the whole table is 49 rows. */}
      {stats.truncated && (
        <div
          className="vc-card"
          style={{ padding: "8px 11px", marginBottom: 10, fontSize: 12, color: "#b26a00" }}
        >
          Showing aggregates over your most recent {stats.scannedCount} quotations of{" "}
          {stats.totalCount}.
        </div>
      )}

      <div className="vc-kpis">
        <div className="vc-kpi">
          <div className="vc-kpi-label">Total Quoted</div>
          <div className="vc-kpi-value">{formatMoneyCompact(stats.totalNet)}</div>
          <div className="vc-kpi-sub">
            {stats.totalCount} quotations · excl. GST
          </div>
        </div>

        <div className="vc-kpi">
          <div className="vc-kpi-label">This Month</div>
          <div className="vc-kpi-value">{formatMoneyCompact(stats.thisMonthNet)}</div>
          <div className={"vc-kpi-sub " + (up ? "vc-up" : "vc-down")}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{" "}
            {Math.abs(stats.monthChangePercent).toFixed(1)}% vs last month
          </div>
        </div>

        <div className="vc-kpi">
          <div className="vc-kpi-label">Won</div>
          <div className="vc-kpi-value">{formatMoneyCompact(stats.wonNet)}</div>
          <div className="vc-kpi-sub">
            <Trophy size={11} /> {stats.wonCount} won · {stats.winRate.toFixed(1)}% win rate
          </div>
        </div>

        <div className="vc-kpi">
          <div className="vc-kpi-label">Average Quote</div>
          <div className="vc-kpi-value">{formatMoneyCompact(stats.avgQuoteValue)}</div>
          <div className="vc-kpi-sub">{formatSqft(stats.totalSqft)} sqft quoted</div>
        </div>

        <div className="vc-kpi">
          <div className="vc-kpi-label">Pipeline</div>
          <div className="vc-kpi-value">
            {(stats.counts.draft || 0) + (stats.counts.sent || 0)}
          </div>
          <div className="vc-kpi-sub">
            {stats.counts.draft || 0} draft · {stats.counts.sent || 0} sent
          </div>
        </div>

        <div className="vc-kpi">
          <div className="vc-kpi-label">GST Collected</div>
          <div className="vc-kpi-value">{formatMoneyCompact(stats.totalGst)}</div>
          <div className="vc-kpi-sub">Grand total {formatMoneyCompact(stats.totalGrand)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 10 }}>
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Last 8 Weeks</span>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#8a94a1" }}>
              quoted value, excl. GST
            </div>
          </div>
          <div className="vc-bars">
            {stats.weeklyBars.map((w) => (
              <div className="vc-bar-col" key={w.label}>
                <div
                  className="vc-bar"
                  style={{ height: `${Math.max(2, (w.amount / maxBar) * 100)}%` }}
                  title={`${w.label}: ${formatMoney(w.amount)} (${w.count})`}
                />
                <div className="vc-bar-label">{w.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="vc-card">
          <div className="vc-card-head">
            <Clock size={13} color="#8a94a1" />
            <span className="vc-card-title">Needs Follow-up</span>
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => router.push(`/${slug}/console/quotations`)}
            >
              View all
            </button>
          </div>
          <div className="vc-grid-wrap" style={{ maxHeight: 220 }}>
            {stats.pendingFollowUps.length === 0 ? (
              <div className="vc-empty">
                <div className="vc-empty-title">All caught up</div>
                <div>No draft or sent quotations waiting.</div>
              </div>
            ) : (
              <table className="vc-table">
                <tbody>
                  {stats.pendingFollowUps.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/${slug}/console/quotations/${p.id}`)}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.customer_name || "—"}</div>
                        <div style={{ fontSize: 11, color: "#8a94a1" }}>
                          {p.quote_no} · {formatRelative(p.created_at)}
                        </div>
                      </td>
                      <td style={{ width: 70 }}>
                        <StatusPill status={p.status} />
                      </td>
                      <td className="vc-num" style={{ width: 110 }}>
                        {formatMoneyCompact(p.net_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="vc-btn vc-btn-primary"
          onClick={() => router.push(`/${slug}/console/quotations/new`)}
        >
          <FileText size={13} /> New Quotation <span className="vc-kbd">Alt N</span>
        </button>
        <button
          type="button"
          className="vc-btn"
          onClick={() => router.push(`/${slug}/console/reports`)}
        >
          Reports
        </button>
      </div>
    </div>
  );
}
