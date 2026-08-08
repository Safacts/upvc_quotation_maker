/**
 * record-nav.ts — the PgUp / PgDn "next voucher" rail.
 *
 * ============================================================================
 *  THE PROBLEM
 * ============================================================================
 * In Tally you open a voucher, press PgDn, and you are in the next one. You
 * never return to the list. Reviewing thirty quotations is thirty keystrokes.
 * In a web app the naive equivalent is Back → find the row again → Enter, three
 * interactions and a full grid refetch per record, and the grid usually loses
 * your scroll position on the way. That difference is most of why a Tally user
 * says a web ERP "feels slow" even when every individual page is fast.
 *
 * ============================================================================
 *  HOW IT WORKS — A CURSOR HANDED FROM THE GRID TO THE EDITOR
 * ============================================================================
 * When the grid renders a page it publishes the ORDERED id list it is currently
 * showing, together with the filter that produced it. The editor picks that up
 * and can then resolve prev/next locally, with no request at all.
 *
 * WHY sessionStorage AND NOT A CONTEXT OR A URL PARAM:
 *  - Context dies on a full page load, and a console user WILL refresh, deep
 *    link, and open a quotation in a new tab. The cursor must outlive React.
 *  - The URL would have to carry ~50 uuids. That is a 2 kB address bar, it
 *    breaks link sharing, and it leaks the tenant's row ids into logs.
 *  - sessionStorage is per TAB, which is exactly right: two tabs browsing two
 *    different filters each keep their own rail instead of fighting over one.
 *  - It is NOT localStorage: a cursor from last Tuesday's session pointing at
 *    quotations that have since been deleted is worse than no cursor.
 *
 * ============================================================================
 *  THE CURSOR IS A HINT, NEVER AN AUTHORITY
 * ============================================================================
 * Every id that comes out of here is fed back into `/api/console/quotations/[id]`,
 * which re-reads the row WITH `client_id` scoped to the session cookie. A
 * tampered sessionStorage entry naming another tenant's uuid therefore produces
 * a 404, not a leak — the same 404 as a row that does not exist. This file is a
 * navigation convenience and carries no authority whatsoever.
 */

export interface RecordCursor {
  /** Ordered row ids exactly as the grid displayed them. */
  ids: string[];
  /** 1-based page the ids came from, so the editor can say "3 of 50 on page 2". */
  page: number;
  totalPages: number;
  /** Total rows matching the filter, for the "record N of M" caption. */
  totalCount: number;
  /** Serialized filter (search + status + period), used to detect staleness. */
  signature: string;
  /** Epoch ms. A cursor older than MAX_AGE_MS is discarded. */
  savedAt: number;
}

const KEY_PREFIX = "vc:cursor:";

/**
 * Half an hour. Long enough to cover a genuine editing session, short enough
 * that a tab left open overnight does not offer to page through a list that no
 * longer resembles the data.
 */
const MAX_AGE_MS = 30 * 60 * 1000;

function key(clientId: string, screenId: string): string {
  return `${KEY_PREFIX}${clientId}:${screenId}`;
}

/** Publish the current page's ids. Called by the grid after every successful load. */
export function saveCursor(
  clientId: string,
  screenId: string,
  cursor: Omit<RecordCursor, "savedAt">,
): void {
  try {
    const payload: RecordCursor = { ...cursor, savedAt: Date.now() };
    sessionStorage.setItem(key(clientId, screenId), JSON.stringify(payload));
  } catch {
    // Private mode / quota. PgUp-PgDn degrades to disabled; nothing else breaks.
  }
}

/** Read the cursor, or null when absent, corrupt or stale. */
export function loadCursor(clientId: string, screenId: string): RecordCursor | null {
  try {
    const raw = sessionStorage.getItem(key(clientId, screenId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordCursor;
    if (!parsed || !Array.isArray(parsed.ids)) return null;
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      return null;
    }
    // Defensive: ids must be strings. A corrupted array of objects would render
    // "[object Object]" into a URL and produce a confusing 404.
    parsed.ids = parsed.ids.filter((id): id is string => typeof id === "string" && !!id);
    return parsed.ids.length ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCursor(clientId: string, screenId: string): void {
  try {
    sessionStorage.removeItem(key(clientId, screenId));
  } catch {
    // Ignore.
  }
}

export interface NavPosition {
  /** 0-based index within the cursor, or -1 when the record is not in it. */
  index: number;
  /** Id to navigate to on PgUp, or null at the start of the rail. */
  prevId: string | null;
  /** Id to navigate to on PgDn, or null at the end of the rail. */
  nextId: string | null;
  /** 1-based position across the WHOLE filtered set, for the caption. */
  position: number;
  total: number;
  /** True when PgDn has reached the end of this page but more pages exist. */
  atPageEnd: boolean;
  /** True when PgUp has reached the start of this page but earlier pages exist. */
  atPageStart: boolean;
}

/**
 * Locate a record in the cursor and work out its neighbours.
 *
 * A record that is NOT in the cursor (deep link, or the row was filtered out
 * after an edit changed its status) yields index -1 and no neighbours. The UI
 * then hides the prev/next affordance rather than guessing — silently jumping
 * to an unrelated quotation because the cursor happened to be lying around
 * would be far worse than a disabled button.
 *
 * @param pageSize Rows per page, needed to convert a within-page index into a
 *                 position across the whole result set. Passing the wrong value
 *                 only mislabels the caption; navigation is unaffected.
 */
export function locate(
  cursor: RecordCursor | null,
  id: string,
  pageSize: number,
): NavPosition {
  const empty: NavPosition = {
    index: -1,
    prevId: null,
    nextId: null,
    position: 0,
    total: cursor?.totalCount ?? 0,
    atPageEnd: false,
    atPageStart: false,
  };
  if (!cursor || !id) return empty;

  const index = cursor.ids.indexOf(id);
  if (index < 0) return empty;

  const offset = Math.max(0, (cursor.page - 1) * pageSize);
  return {
    index,
    prevId: index > 0 ? cursor.ids[index - 1] : null,
    nextId: index < cursor.ids.length - 1 ? cursor.ids[index + 1] : null,
    position: offset + index + 1,
    total: cursor.totalCount || cursor.ids.length,
    atPageEnd: index === cursor.ids.length - 1 && cursor.page < cursor.totalPages,
    atPageStart: index === 0 && cursor.page > 1,
  };
}

/**
 * A stable signature for the filter that produced a page of rows.
 *
 * The editor compares this against the filter the grid last used. If a user
 * changes the search term in another tab the signatures diverge and the cursor
 * is treated as stale — better to disable PgDn than to walk a rail that no
 * longer matches what the user believes they are browsing.
 *
 * Keys are sorted so `{q,status}` and `{status,q}` produce the same string;
 * without that, an unrelated re-ordering of the object literal would invalidate
 * every user's cursor on deploy.
 */
export function filterSignature(parts: Record<string, unknown>): string {
  const entries = Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort();
  return entries.join("&");
}
