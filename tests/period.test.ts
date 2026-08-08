/**
 * PHASE 3 — the F2 period selector's date logic.
 *
 * Every test injects a fixed clock. A suite that reads the real date passes in
 * August and fails in April, and the April boundary is precisely the case worth
 * pinning: the Indian financial year turns over on 1 April, and a report that
 * is off by a whole FY looks completely reasonable on screen.
 *
 * TWO INVARIANTS ARE BEING PROTECTED:
 *
 *  1. `to` IS EXCLUSIVE. `created_at <= '2026-08-08'` compares a timestamp
 *     against midnight and silently drops everything saved during the working
 *     day on the 8th. Half-open ranges make that impossible.
 *  2. EVERYTHING IS UTC. IST is UTC+5:30, so a local-time `toISOString()` on
 *     1 August 00:00 IST yields "2026-07-31" and "this month" starts in the
 *     previous month.
 */
import { describe, it, expect } from "vitest";
import {
  PERIOD_PRESETS,
  customPeriod,
  describePeriod,
  financialYearLabel,
  financialYearOf,
  isIsoDay,
  isoDay,
  resolvePeriod,
  toInclusiveEnd,
  applyPeriodParams,
  defaultPeriod,
} from "@/lib/period";

/** A fixed clock: Saturday 8 August 2026, mid-afternoon IST / 09:30 UTC. */
const NOW = new Date("2026-08-08T09:30:00Z");

describe("period — financial year identification", () => {
  it("April onwards belongs to the FY starting that year", () => {
    expect(financialYearOf(new Date("2026-04-01T00:00:00Z"))).toBe(2026);
    expect(financialYearOf(new Date("2026-12-31T00:00:00Z"))).toBe(2026);
  });

  it("January to March belongs to the PREVIOUS year's FY", () => {
    // The classic off-by-a-year. 15-01-2026 is FY 2025-26, not 2026-27.
    expect(financialYearOf(new Date("2026-01-15T00:00:00Z"))).toBe(2025);
    expect(financialYearOf(new Date("2026-03-31T00:00:00Z"))).toBe(2025);
  });

  it("labels the FY the way an accountant writes it", () => {
    expect(financialYearLabel(2026)).toBe("FY 2026-27");
    expect(financialYearLabel(2029)).toBe("FY 2029-30");
    // Century roll-over must not produce "FY 2099-100".
    expect(financialYearLabel(2099)).toBe("FY 2099-00");
  });
});

describe("period — presets resolve to half-open UTC ranges", () => {
  it("today spans exactly one day, exclusive at the end", () => {
    const r = resolvePeriod("today", NOW);
    expect(r.from).toBe("2026-08-08");
    // Tomorrow, NOT today — otherwise every quotation saved today is excluded.
    expect(r.to).toBe("2026-08-09");
  });

  it("yesterday ends where today begins", () => {
    const r = resolvePeriod("yesterday", NOW);
    expect(r.from).toBe("2026-08-07");
    expect(r.to).toBe("2026-08-08");
  });

  it("last 7 days includes today (6 back + today)", () => {
    const r = resolvePeriod("last_7", NOW);
    expect(r.from).toBe("2026-08-02");
    expect(r.to).toBe("2026-08-09");
  });

  it("last 30 days includes today", () => {
    const r = resolvePeriod("last_30", NOW);
    expect(r.from).toBe("2026-07-10");
    expect(r.to).toBe("2026-08-09");
  });

  it("this month starts on the 1st", () => {
    const r = resolvePeriod("this_month", NOW);
    expect(r.from).toBe("2026-08-01");
    expect(r.to).toBe("2026-08-09");
  });

  it("last month is day-1 to day-1, sidestepping month length entirely", () => {
    const r = resolvePeriod("last_month", NOW);
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-08-01");
  });

  it("last month handles the January → December year boundary", () => {
    const jan = new Date("2026-01-15T10:00:00Z");
    const r = resolvePeriod("last_month", jan);
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2026-01-01");
  });

  it("last month handles February correctly", () => {
    const mar = new Date("2026-03-15T10:00:00Z");
    const r = resolvePeriod("last_month", mar);
    expect(r.from).toBe("2026-02-01");
    expect(r.to).toBe("2026-03-01");
  });

  it("all time is unbounded on both sides", () => {
    const r = resolvePeriod("all", NOW);
    // Empty strings, not a fake "1970-01-01" — the API omits the predicate.
    expect(r.from).toBe("");
    expect(r.to).toBe("");
  });
});

describe("period — weeks start on Monday", () => {
  it("mid-week counts back to Monday", () => {
    // 2026-08-08 is a Saturday.
    const r = resolvePeriod("this_week", NOW);
    expect(r.from).toBe("2026-08-03"); // the Monday
    expect(r.to).toBe("2026-08-09");
  });

  it("SUNDAY counts back six days, not zero", () => {
    // getUTCDay() is 0 on Sunday. Treating that as "already Monday" gives a
    // one-day week and makes every Sunday report look catastrophically low.
    const sunday = new Date("2026-08-09T10:00:00Z");
    expect(sunday.getUTCDay()).toBe(0);
    const r = resolvePeriod("this_week", sunday);
    expect(r.from).toBe("2026-08-03");
  });

  it("Monday is its own week start", () => {
    const monday = new Date("2026-08-03T10:00:00Z");
    expect(monday.getUTCDay()).toBe(1);
    expect(resolvePeriod("this_week", monday).from).toBe("2026-08-03");
  });
});

describe("period — FISCAL quarters, aligned to April", () => {
  const cases: Array<[string, string]> = [
    ["2026-04-15", "2026-04-01"], // Q1 Apr-Jun
    ["2026-06-30", "2026-04-01"],
    ["2026-08-08", "2026-07-01"], // Q2 Jul-Sep
    ["2026-11-02", "2026-10-01"], // Q3 Oct-Dec
    // Q4 is Jan-Mar and belongs to the FY that STARTED the previous April.
    // Note the year: the quarter opens on 1 Jan 2027 inside FY 2026-27.
    ["2027-01-05", "2027-01-01"],
    ["2027-02-20", "2027-01-01"],
    ["2027-03-31", "2027-01-01"],
  ];

  for (const [today, expectedStart] of cases) {
    it(`${today} sits in the quarter starting ${expectedStart}`, () => {
      const r = resolvePeriod("this_quarter", new Date(`${today}T10:00:00Z`));
      expect(r.from).toBe(expectedStart);
    });
  }
});

describe("period — financial year presets", () => {
  it("current FY starts on 1 April of the FY's starting year", () => {
    const r = resolvePeriod("fy_current", NOW);
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-08-09");
  });

  it("in JANUARY the current FY still starts in the PREVIOUS April", () => {
    // The bug this catches: naively using getFullYear() would report
    // 2027-04-01, a start date in the future, and return zero rows.
    const jan = new Date("2027-01-20T10:00:00Z");
    const r = resolvePeriod("fy_current", jan);
    expect(r.from).toBe("2026-04-01");
  });

  it("previous FY is a full closed year, April to April", () => {
    const r = resolvePeriod("fy_previous", NOW);
    expect(r.from).toBe("2025-04-01");
    // Exclusive: 1 April 2026, so 31 March 2026 IS included.
    expect(r.to).toBe("2026-04-01");
  });

  it("the FY boundary flips on 1 April, not 31 March", () => {
    const mar31 = resolvePeriod("fy_current", new Date("2026-03-31T23:00:00Z"));
    const apr01 = resolvePeriod("fy_current", new Date("2026-04-01T01:00:00Z"));
    expect(mar31.from).toBe("2025-04-01");
    expect(apr01.from).toBe("2026-04-01");
  });

  it("the default console period is the current FY", () => {
    expect(defaultPeriod(NOW).preset).toBe("fy_current");
  });
});

describe("period — custom ranges", () => {
  it("converts an inclusive end date into an exclusive bound", () => {
    const r = customPeriod("2026-08-01", "2026-08-08");
    expect(r.from).toBe("2026-08-01");
    // +1 day. This is the whole reason the helper exists.
    expect(r.to).toBe("2026-08-09");
  });

  it("round-trips through toInclusiveEnd for display", () => {
    const r = customPeriod("2026-08-01", "2026-08-08");
    expect(toInclusiveEnd(r.to)).toBe("2026-08-08");
  });

  it("SWAPS reversed dates rather than returning nothing", () => {
    // Picking the end date first is a normal way to use two date inputs. An
    // empty report with no explanation is a worse answer than the obvious one.
    // The result must be IDENTICAL to entering them the right way round.
    const reversed = customPeriod("2026-08-08", "2026-08-01");
    const forward = customPeriod("2026-08-01", "2026-08-08");
    expect(reversed).toEqual(forward);
    expect(reversed.from).toBe("2026-08-01");
    expect(reversed.to).toBe("2026-08-09");
  });

  it("a single-day custom range spans one day", () => {
    const r = customPeriod("2026-08-08", "2026-08-08");
    expect(r.from).toBe("2026-08-08");
    expect(r.to).toBe("2026-08-09");
  });

  it("crosses a month boundary correctly", () => {
    expect(customPeriod("2026-01-01", "2026-01-31").to).toBe("2026-02-01");
  });

  it("crosses a LEAP DAY correctly", () => {
    // 2028 is a leap year: 28 Feb + 1 = 29 Feb, not 1 March.
    expect(customPeriod("2028-02-01", "2028-02-28").to).toBe("2028-02-29");
    expect(customPeriod("2028-02-01", "2028-02-29").to).toBe("2028-03-01");
  });

  it("crosses a year boundary correctly", () => {
    expect(customPeriod("2026-12-01", "2026-12-31").to).toBe("2027-01-01");
  });

  it("accepts a one-sided range", () => {
    expect(customPeriod("2026-08-01", "")).toEqual({
      from: "2026-08-01",
      to: "",
      preset: "custom",
    });
  });

  it("ignores malformed dates", () => {
    expect(customPeriod("not-a-date", "also-bad").from).toBe("");
  });
});

describe("period — ISO day validation", () => {
  it("accepts real dates", () => {
    expect(isIsoDay("2026-08-08")).toBe(true);
    expect(isIsoDay("2028-02-29")).toBe(true); // leap year
  });

  it("rejects dates that do not exist", () => {
    // `new Date("2026-02-30")` silently rolls to 2 March — this is what stops
    // that becoming a range nobody asked for.
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2027-02-29")).toBe(false); // not a leap year
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("2026-00-10")).toBe(false);
  });

  it("rejects the wrong format", () => {
    expect(isIsoDay("08-08-2026")).toBe(false);
    expect(isIsoDay("2026/08/08")).toBe(false);
    expect(isIsoDay("")).toBe(false);
    expect(isIsoDay(null)).toBe(false);
  });

  it("isoDay formats in UTC", () => {
    expect(isoDay(new Date("2026-08-08T23:59:59Z"))).toBe("2026-08-08");
    // 00:30 UTC is still the 8th in UTC even though it is 06:00 IST.
    expect(isoDay(new Date("2026-08-08T00:30:00Z"))).toBe("2026-08-08");
  });
});

describe("period — human labels", () => {
  it("names a preset rather than spelling out dates", () => {
    expect(describePeriod(resolvePeriod("this_month", NOW))).toBe("This Month");
  });

  it("labels FY presets in accountant form", () => {
    expect(describePeriod(resolvePeriod("fy_current", NOW))).toBe("FY 2026-27");
    expect(describePeriod(resolvePeriod("fy_previous", NOW))).toBe("FY 2025-26");
  });

  it("shows a custom range INCLUSIVELY, in Indian date order", () => {
    // The user set "to 8 August". Showing the exclusive 09-08-2026 would look
    // like a bug and invite them to "correct" it.
    const r = customPeriod("2026-08-01", "2026-08-08");
    expect(describePeriod(r)).toBe("01-08-2026 to 08-08-2026");
  });

  it("describes one-sided and unbounded ranges", () => {
    expect(describePeriod(resolvePeriod("all", NOW))).toBe("All Time");
    expect(describePeriod(customPeriod("2026-08-01", ""))).toBe("From 01-08-2026");
    expect(describePeriod(customPeriod("", "2026-08-08"))).toBe("Up to 08-08-2026");
  });
});

describe("period — query parameters", () => {
  it("sets both bounds when present", () => {
    const p = applyPeriodParams(new URLSearchParams(), resolvePeriod("today", NOW));
    expect(p.get("from")).toBe("2026-08-08");
    expect(p.get("to")).toBe("2026-08-09");
  });

  it("DELETES the params for an unbounded range", () => {
    // Leaving a stale `from` behind would silently keep filtering after the
    // user explicitly asked for All Time.
    const p = new URLSearchParams({ from: "2020-01-01", to: "2020-02-01" });
    applyPeriodParams(p, resolvePeriod("all", NOW));
    expect(p.has("from")).toBe(false);
    expect(p.has("to")).toBe(false);
  });
});

describe("period — preset catalogue", () => {
  it("every preset resolves without throwing", () => {
    for (const p of PERIOD_PRESETS) {
      expect(() => resolvePeriod(p.key, NOW)).not.toThrow();
    }
  });

  it("every preset produces from <= to when both are bounded", () => {
    for (const p of PERIOD_PRESETS) {
      const r = resolvePeriod(p.key, NOW);
      if (r.from && r.to) {
        expect(r.from <= r.to, `${p.key}: ${r.from} > ${r.to}`).toBe(true);
      }
    }
  });

  it("single-letter accelerators are unique", () => {
    // Two presets sharing a hint means one is unreachable by keyboard.
    const hints = PERIOD_PRESETS.map((p) => p.hint).filter(Boolean);
    expect(new Set(hints).size).toBe(hints.length);
  });

  it("offers NO calendar-year option", () => {
    // Deliberate. "This year" meaning 1 January on a GST report is a number
    // that could be handed to a CA. Only FY presets exist.
    const labels = PERIOD_PRESETS.map((p) => p.label.toLowerCase());
    expect(labels).not.toContain("this year");
    expect(labels).not.toContain("last year");
  });
});
