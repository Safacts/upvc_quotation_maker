/**
 * TEST — ANALYTICS (src/lib/analytics.ts)
 *
 * Verifies the TypeScript port of the Flutter analytics_screen.dart derived
 * computations. The numbers the console Overview shows must match what the
 * Flutter app would compute from the same data.
 */
import { describe, it, expect } from "vitest";
import { computeAnalytics, estimateNetEarnings } from "@/lib/analytics";

function q(id: string, status: string, created: string, customer: string, net: number, gst: number, measured: any[] = []): any {
  // Build a minimal quotation row whose quotationTotals() computes to the
  // desired net and gst. A single unmeasured item at `rate: net` yields
  // subtotal = net; with include_gst + gst_percentage that gives gst = net * pct/100.
  // When explicit measured items are passed (top-products test), we instead
  // inject the totals via unmeasured_items so the money math is deterministic.
  const useMeasured = measured.length > 0;
  return {
    id,
    quote_no: id,
    status,
    created_at: created,
    customer_name: customer,
    transport_cost: 0,
    include_gst: gst > 0,
    gst_percentage: gst > 0 ? Math.round((gst / net) * 100) || 18 : 0,
    measured_items: useMeasured ? measured : [],
    unmeasured_items: useMeasured ? [{ units: 1, rate: net }] : [{ units: 1, rate: net }],
  };
}

describe("estimateNetEarnings()", () => {
  it("subtracts cost margin from won revenue", () => {
    // Dart: netEarnings = _wonRevenue * (1 - margin / 100)
    expect(estimateNetEarnings(100000, 30)).toBe(70000);
  });

  it("returns full revenue at 0% margin", () => {
    expect(estimateNetEarnings(50000, 0)).toBe(50000);
  });
});

describe("computeAnalytics()", () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisMonth = `${y}-${String(m + 1).padStart(2, "0")}-15`;
  const lastMonth = `${y}-${String(m).padStart(2, "0")}-15`; // JS month is 0-indexed, m is current month (0-11), so m is last month

  it("counts statuses case-insensitively", () => {
    const r = computeAnalytics([
      q("1", "won", thisMonth, "Acme", 10000, 1800),
      q("2", "Won", thisMonth, "Beta", 20000, 3600),
      q("3", "sent", thisMonth, "Gamma", 5000, 900),
      q("4", "draft", thisMonth, "Delta", 3000, 0),
      q("5", "lost", thisMonth, "Epsilon", 1000, 0),
    ]);
    expect(r.counts.won).toBe(2);
    expect(r.counts.sent).toBe(1);
    expect(r.counts.draft).toBe(1);
    expect(r.counts.lost).toBe(1);
    expect(r.totalCount).toBe(5);
  });

  it("computes win rate", () => {
    const r = computeAnalytics([
      q("1", "won", thisMonth, "A", 10000, 1800),
      q("2", "won", thisMonth, "B", 20000, 3600),
      q("3", "sent", thisMonth, "C", 5000, 900),
      q("4", "lost", thisMonth, "D", 1000, 0),
    ]);
    expect(r.winRate).toBe(50); // 2 won / 4 total
    expect(r.wonCount).toBe(2);
  });

  it("aggregates GST summaries", () => {
    const r = computeAnalytics([
      q("1", "won", thisMonth, "A", 10000, 1800),
      q("2", "sent", thisMonth, "B", 5000, 900),
    ]);
    expect(r.allTimeGst).toBe(2700); // 1800 + 900
    expect(r.thisMonthGst).toBe(2700);
  });

  it("identifies top products by description count", () => {
    const r = computeAnalytics([
      q("1", "won", thisMonth, "A", 10000, 1800, [
        { description: "Sliding Window", width: 1200, height: 1500, units: 1, rate: 450 },
        { description: "Sliding Window", width: 900, height: 1200, units: 1, rate: 450 },
        { description: "Fixed Panel", width: 600, height: 600, units: 1, rate: 380 },
      ]),
      q("2", "sent", thisMonth, "B", 5000, 900, [
        { description: "Sliding Window", width: 1200, height: 1500, units: 1, rate: 450 },
      ]),
    ]);
    expect(r.topProducts[0]).toEqual({ name: "Sliding Window", count: 3 });
    expect(r.topProducts[1]).toEqual({ name: "Fixed Panel", count: 1 });
  });

  it("identifies repeat customers (2+ quotes)", () => {
    const r = computeAnalytics([
      q("1", "won", thisMonth, "Acme Corp", 10000, 1800),
      q("2", "sent", thisMonth, "Acme Corp", 20000, 3600),
      q("3", "won", thisMonth, "Acme Corp", 15000, 2700),
      q("4", "draft", thisMonth, "Beta LLC", 5000, 900),
    ]);
    expect(r.repeatCustomers.length).toBe(1);
    expect(r.repeatCustomers[0].name).toBe("Acme Corp");
    expect(r.repeatCustomers[0].count).toBe(3);
  });

  it("returns empty analytics for no quotations", () => {
    const r = computeAnalytics([]);
    expect(r.totalCount).toBe(0);
    expect(r.winRate).toBe(0);
    expect(r.avgQuoteValue).toBe(0);
    expect(r.topProducts.length).toBe(0);
  });
});
