/**
 * period.ts — the reporting-period vocabulary behind F2 (Tally's period key).
 *
 * ============================================================================
 *  THE FINANCIAL YEAR IS APRIL-MARCH, AND THAT IS THE WHOLE POINT
 * ============================================================================
 * Every Indian business — including all three of our fabricators and, more
 * importantly, their accountants — reckons in the FY that runs 1 April to
 * 31 March. "This year" on a GST summary that quietly means 1 January is not a
 * cosmetic slip: it is a number the client may hand to their CA. So there is no
 * calendar-year preset at all, only `fy_current` and `fy_previous`.
 *
 * FY LABELLING: the year that starts 01-04-2026 is "FY 2026-27". A date in
 * January 2026 belongs to FY 2025-26. Getting this backwards produces a report
 * that is off by a whole year while looking perfectly reasonable.
 *
 * ============================================================================
 *  HALF-OPEN RANGES [from, to) — MATCHING THE API EXACTLY
 * ============================================================================
 * `from` is INCLUSIVE, `to` is EXCLUSIVE, identical to
 * `/api/console/reports` (`resolveRange` / `dateFilters`) and to
 * `/api/console/quotations`. Both are plain `YYYY-MM-DD`.
 *
 * A closed range is the classic off-by-one here: `created_at <= '2026-08-08'`
 * compares a TIMESTAMP against midnight, so every quotation saved during the
 * working day on the 8th is silently excluded and the month's total is short by
 * a day. Making `to` exclusive and always setting it to the day AFTER the last
 * day the user asked for removes that failure by construction. This is why the
 * UI shows an inclusive label ("01-08-2026 to 08-08-2026") while the value it
 * sends is `to = 2026-08-09`.
 *
 * ============================================================================
 *  UTC ONLY
 * ============================================================================
 * Every function builds dates with `Date.UTC` and formats with the UTC getters.
 * IST is UTC+5:30, so a local-time `toISOString()` on 1 August 00:00 IST yields
 * "2026-07-31" — the month boundary moves and "this month" starts in the
 * previous month. Postgres stores these as UTC, so UTC is also what the
 * comparison actually means.
 */

export type PeriodPresetKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "fy_current"
  | "fy_previous"
  | "all"
  | "custom";

export interface PeriodRange {
  /** Inclusive lower bound, `YYYY-MM-DD`. Empty string means unbounded. */
  from: string;
  /** EXCLUSIVE upper bound, `YYYY-MM-DD`. Empty string means unbounded. */
  to: string;
  /** Which preset produced this, or "custom" when the user typed the dates. */
  preset: PeriodPresetKey;
}

export interface PeriodPreset {
  key: PeriodPresetKey;
  label: string;
  /** Single-key accelerator inside the period dialog. */
  hint?: string;
}

/**
 * Presets in the order a fabricator reaches for them. "This Month" is the
 * common case, the FY entries are what an accountant asks for, and "All Time"
 * is last because it is the slowest query in the product.
 */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { key: "today", label: "Today", hint: "T" },
  { key: "yesterday", label: "Yesterday", hint: "Y" },
  { key: "this_week", label: "This Week", hint: "W" },
  { key: "last_7", label: "Last 7 Days", hint: "7" },
  { key: "last_30", label: "Last 30 Days", hint: "3" },
  { key: "this_month", label: "This Month", hint: "M" },
  { key: "last_month", label: "Last Month", hint: "L" },
  { key: "this_quarter", label: "This Quarter", hint: "Q" },
  { key: "fy_current", label: "This Financial Year", hint: "F" },
  { key: "fy_previous", label: "Previous Financial Year", hint: "P" },
  { key: "all", label: "All Time", hint: "A" },
];

/** Indian FY starts in April. Month index 3 in JS's 0-based months. */
const FY_START_MONTH = 3;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** `YYYY-MM-DD` in UTC. Never `toISOString().slice` on a local-time Date. */
export function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midnight UTC on the same calendar day, so arithmetic never drifts by hours. */
function startOfDayUtc(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * The financial year a date falls in, identified by its STARTING year.
 * 15-01-2026 → 2025 (i.e. FY 2025-26). 15-04-2026 → 2026 (FY 2026-27).
 */
export function financialYearOf(d: Date): number {
  return d.getUTCMonth() >= FY_START_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** "FY 2026-27" from a starting year of 2026. */
export function financialYearLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Resolve a preset into a concrete half-open range.
 *
 * @param preset Which preset to resolve.
 * @param now    Injectable clock. Tests MUST pass this — a suite that depends
 *               on the real date passes in August and fails in April, and the
 *               FY boundary cases are exactly the ones worth pinning down.
 */
export function resolvePeriod(preset: PeriodPresetKey, now: Date = new Date()): PeriodRange {
  const today = startOfDayUtc(now);
  // The exclusive bound for any range that includes today.
  const tomorrow = addDays(today, 1);

  switch (preset) {
    case "today":
      return { from: isoDay(today), to: isoDay(tomorrow), preset };

    case "yesterday": {
      const y = addDays(today, -1);
      return { from: isoDay(y), to: isoDay(today), preset };
    }

    case "this_week": {
      // Week starts MONDAY. `getUTCDay()` is 0 for Sunday, so Sunday must map
      // to 6 days from the week start, not to 0 — otherwise Sunday reports show
      // a one-day week and every Sunday total looks catastrophically low.
      const dow = today.getUTCDay();
      const back = dow === 0 ? 6 : dow - 1;
      return { from: isoDay(addDays(today, -back)), to: isoDay(tomorrow), preset };
    }

    case "last_7":
      // 7 days INCLUDING today: 6 back plus today.
      return { from: isoDay(addDays(today, -6)), to: isoDay(tomorrow), preset };

    case "last_30":
      return { from: isoDay(addDays(today, -29)), to: isoDay(tomorrow), preset };

    case "this_month":
      return {
        from: isoDay(utc(today.getUTCFullYear(), today.getUTCMonth(), 1)),
        to: isoDay(tomorrow),
        preset,
      };

    case "last_month": {
      // Day 1 of the previous month to day 1 of this month (exclusive), so the
      // 28/29/30/31-day question never has to be answered.
      const firstThis = utc(today.getUTCFullYear(), today.getUTCMonth(), 1);
      const firstPrev = utc(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
      return { from: isoDay(firstPrev), to: isoDay(firstThis), preset };
    }

    case "this_quarter": {
      // FISCAL quarters, aligned to April: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar.
      // Calendar quarters would put January in "Q1" and disagree with the GST
      // filing the client's accountant is actually preparing.
      const fyStart = financialYearOf(today);
      const monthsIntoFy = (today.getUTCMonth() - FY_START_MONTH + 12) % 12;
      const qStartMonth = FY_START_MONTH + Math.floor(monthsIntoFy / 3) * 3;
      return { from: isoDay(utc(fyStart, qStartMonth, 1)), to: isoDay(tomorrow), preset };
    }

    case "fy_current": {
      const fy = financialYearOf(today);
      return { from: isoDay(utc(fy, FY_START_MONTH, 1)), to: isoDay(tomorrow), preset };
    }

    case "fy_previous": {
      const fy = financialYearOf(today) - 1;
      return {
        from: isoDay(utc(fy, FY_START_MONTH, 1)),
        // Exclusive: 1 April of the following year.
        to: isoDay(utc(fy + 1, FY_START_MONTH, 1)),
        preset,
      };
    }

    case "all":
      // Empty strings, NOT a sentinel like "1970-01-01". The API treats "" as
      // "no filter" and omits the predicate entirely; a fake early date would
      // add a pointless comparison to every row.
      return { from: "", to: "", preset };

    case "custom":
    default:
      return { from: "", to: "", preset: "custom" };
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDay(v: unknown): boolean {
  const s = (v ?? "").toString();
  if (!ISO_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = utc(y, m - 1, d);
  // Round-trips only if the components were valid — this is what rejects
  // 2026-02-30, which `new Date()` would silently roll into 2 March.
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * Build a range from two INCLUSIVE dates the user typed.
 *
 * The second date is converted to an exclusive bound by adding one day. This is
 * the single place that conversion happens, so the "to" a user sees and the
 * "to" the API receives can never drift apart.
 *
 * Reversed dates are SWAPPED rather than rejected: picking the end first is a
 * normal way to use two date inputs, and an empty report with no explanation is
 * a worse answer than the obvious interpretation.
 */
export function customPeriod(fromInclusive: string, toInclusive: string): PeriodRange {
  const a = isIsoDay(fromInclusive) ? fromInclusive : "";
  const b = isIsoDay(toInclusive) ? toInclusive : "";

  if (a && b) {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return { from: lo, to: isoDay(addDays(new Date(`${hi}T00:00:00Z`), 1)), preset: "custom" };
  }
  if (a) return { from: a, to: "", preset: "custom" };
  if (b) return { from: "", to: isoDay(addDays(new Date(`${b}T00:00:00Z`), 1)), preset: "custom" };
  return { from: "", to: "", preset: "custom" };
}

/**
 * Convert an EXCLUSIVE `to` back to the inclusive date to show in a date input.
 *
 * The dialog's two `<input type="date">` boxes must display what the user
 * means, not the internal bound — showing "09-08-2026" for a period the user
 * set as ending on the 8th looks like a bug and invites them to "correct" it.
 */
export function toInclusiveEnd(exclusiveTo: string): string {
  if (!isIsoDay(exclusiveTo)) return "";
  return isoDay(addDays(new Date(`${exclusiveTo}T00:00:00Z`), -1));
}

/** DD-MM-YYYY, the Indian convention used everywhere else in the console. */
function dmy(iso: string): string {
  if (!isIsoDay(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Human label for the status bar and the topbar chip.
 *
 * Always describes the range INCLUSIVELY, because that is how a person reads a
 * date range. The exclusive bound is an implementation detail of the query and
 * must never surface in the UI.
 */
export function describePeriod(range: PeriodRange): string {
  const preset = PERIOD_PRESETS.find((p) => p.key === range.preset);
  if (range.preset === "all" || (!range.from && !range.to)) return "All Time";

  if (preset && range.preset !== "custom") {
    // Presets that name a fixed window are clearer with the label alone;
    // the exact dates are shown in the dialog itself.
    if (range.preset === "fy_current" || range.preset === "fy_previous") {
      const startYear = Number(range.from.slice(0, 4));
      return financialYearLabel(startYear);
    }
    return preset.label;
  }

  const endInclusive = toInclusiveEnd(range.to);
  if (range.from && endInclusive) return `${dmy(range.from)} to ${dmy(endInclusive)}`;
  if (range.from) return `From ${dmy(range.from)}`;
  if (endInclusive) return `Up to ${dmy(endInclusive)}`;
  return "All Time";
}

/** Append `from` / `to` to a query string, omitting whichever is unbounded. */
export function applyPeriodParams(params: URLSearchParams, range: PeriodRange): URLSearchParams {
  if (range.from) params.set("from", range.from);
  else params.delete("from");
  if (range.to) params.set("to", range.to);
  else params.delete("to");
  return params;
}

/** The console's default window: the current financial year. */
export function defaultPeriod(now: Date = new Date()): PeriodRange {
  return resolvePeriod("fy_current", now);
}
