/**
 * analytics.ts — server-side aggregation for the console Overview and Reports.
 *
 * ============================================================================
 *  PORT OF lib/analytics_screen.dart
 * ============================================================================
 * This module ports the derived computations the Flutter analytics screen
 * performs client-side into reusable TypeScript functions the console's
 * Overview and Reports modules can call. The Flutter app keeps its own copy;
 * this is the console/server copy so the desktop dashboard can show the same
 * KPIs without a round trip to the phone.
 *
 * Aggregations here are intentionally pure functions over plain data so they
 * can be unit-tested without a database and reused by both the stats route and
 * the reports routes.
 */

import { quotationTotals, type MeasuredItemLike, type UnmeasuredItemLike } from "./pricing";

/** A quotation row as it arrives from the API, shaped for analytics. */
export interface AnalyticsQuotation {
  id: string;
  quote_no?: string;
  status?: string;
  created_at?: string;
  customer_name?: string;
  transport_cost?: number | string | null;
  include_gst?: boolean | null;
  gst_percentage?: number | string | null;
  measured_items?: MeasuredItemLike[] | null;
  unmeasured_items?: UnmeasuredItemLike[] | null;
}

export interface WeekBucket {
  label: string;
  iso: string;
  amount: number;
  count: number;
}

export interface TopProduct {
  name: string;
  count: number;
}

export interface RepeatCustomer {
  name: string;
  total: number;
  count: number;
}

export interface AnalyticsResult {
  totalCount: number;
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
  weeklyBars: WeekBucket[];
  topProducts: TopProduct[];
  repeatCustomers: RepeatCustomer[];
  /** Sum of GST across all quotations — "GST Collected" in the UI. */
  allTimeGst: number;
  /** GST for the current month. */
  thisMonthGst: number;
  /** GST for the current quarter. */
  thisQuarterGst: number;
}

/**
 * Compute every KPI the Overview screen needs from a set of quotations.
 *
 * Mirrors the derived getters in `_AnalyticsScreenState` (analytics_screen.dart):
 * `_wonQuotes`, `_thisMonthQuotes`, `_wonRevenue`, `_totalIgst`, `_thisMonthIgst`,
 * `_thisQuarterIgst`, `_weekBars`, `_topProducts`, `_repeatCustomers`.
 */
export function computeAnalytics(quotations: AnalyticsQuotation[]): AnalyticsResult {
  const counts: Record<string, number> = { draft: 0, sent: 0, won: 0, lost: 0 };
  let totalNet = 0;
  let totalGrand = 0;
  let totalGst = 0;
  let totalSqft = 0;
  let wonNet = 0;
  let thisMonthNet = 0;
  let lastMonthNet = 0;
  let thisMonthGst = 0;
  let thisQuarterGst = 0;
  let allTimeGst = 0;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const prev = new Date(curY, curM - 1, 1);
  const prevY = prev.getFullYear();
  const prevM = prev.getMonth();

  // Quarter start: first day of the current quarter.
  const qStart = new Date(curY, Math.floor(curM / 3) * 3, 1);

  // 8 week buckets, Monday-anchored.
  const weekStarts: Date[] = [];
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(d);
  }
  const weeks: WeekBucket[] = weekStarts.map((d) => ({
    label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    iso: d.toISOString().slice(0, 10),
    amount: 0,
    count: 0,
  }));

  // Top products tally: description → count across measured items.
  const productCounts = new Map<string, number>();
  // Repeat customer tally: name → { total, count }.
  const customerTotals = new Map<string, number>();
  const customerCounts = new Map<string, number>();

  for (const q of quotations) {
    const t = quotationTotals(q, q.measured_items ?? [], q.unmeasured_items ?? []);
    const status = (q.status || "draft").toString().trim().toLowerCase();

    counts[status] = (counts[status] || 0) + 1;
    totalNet += t.netTotal;
    totalGrand += t.grandTotal;
    totalGst += t.gstAmount;
    totalSqft += t.totalSqft;
    if (status === "won") wonNet += t.netTotal;

    // GST summaries.
    allTimeGst += t.gstAmount;

    const created = q.created_at ? new Date(q.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) {
      const y = created.getFullYear();
      const m = created.getMonth();

      if (y === curY && m === curM) {
        thisMonthNet += t.netTotal;
        thisMonthGst += t.gstAmount;
      } else if (y === prevY && m === prevM) {
        lastMonthNet += t.netTotal;
      }

      if (created >= qStart) {
        thisQuarterGst += t.gstAmount;
      }

      // Weekly bucket.
      for (let i = 0; i < weeks.length; i++) {
        const start = weekStarts[i];
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        if (created >= start && created < end) {
          weeks[i].amount += t.netTotal;
          weeks[i].count += 1;
          break;
        }
      }
    }

    // Top products — count measured items by description.
    for (const m of q.measured_items ?? []) {
      const desc = (m as any)?.description;
      if (typeof desc === "string" && desc.trim()) {
        const key = desc.trim();
        productCounts.set(key, (productCounts.get(key) || 0) + 1);
      }
    }

    // Repeat customers — tally by customer name.
    const name = (q.customer_name ?? "").trim();
    if (name) {
      customerTotals.set(name, (customerTotals.get(name) || 0) + t.grandTotal);
      customerCounts.set(name, (customerCounts.get(name) || 0) + 1);
    }
  }

  // Top 5 most-quoted products.
  const topProducts: TopProduct[] = [...productCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Repeat customers (2+ quotes), top 5 by total value.
  const repeatCustomers: RepeatCustomer[] = [...customerTotals.entries()]
    .filter(([name]) => (customerCounts.get(name) || 0) >= 2)
    .map(([name, total]) => ({ name, total, count: customerCounts.get(name) || 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const totalCount = quotations.length;
  const wonCount = counts.won || 0;
  const winRate = totalCount > 0 ? (wonCount / totalCount) * 100 : 0;
  let monthChangePercent = 0;
  if (lastMonthNet > 0) {
    monthChangePercent = ((thisMonthNet - lastMonthNet) / lastMonthNet) * 100;
  } else if (thisMonthNet > 0) {
    monthChangePercent = 100;
  }

  return {
    totalCount,
    counts,
    totalNet,
    totalGrand,
    totalGst,
    totalSqft,
    wonNet,
    wonCount,
    winRate,
    thisMonthNet,
    lastMonthNet,
    monthChangePercent,
    avgQuoteValue: totalCount > 0 ? totalNet / totalCount : 0,
    weeklyBars: weeks,
    topProducts,
    repeatCustomers,
    allTimeGst,
    thisMonthGst,
    thisQuarterGst,
  };
}

/**
 * Estimated net earnings from won quotes after cost margin.
 * Mirrors `_buildNetEarnings` in analytics_screen.dart:465-512.
 *
 * @param wonRevenue  Sum of grand totals of won quotations.
 * @param marginPercent  Cost margin percentage (e.g. 30 for 30%).
 */
export function estimateNetEarnings(wonRevenue: number, marginPercent: number): number {
  return wonRevenue * (1 - marginPercent / 100);
}
