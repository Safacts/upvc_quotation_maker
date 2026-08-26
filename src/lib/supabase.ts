/**
 * Single source of truth for Supabase project URL.
 * Other files MUST import this instead of duplicating the fallback.
 */
export const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://jqjxhhgfwdzckijnnede.supabase.co";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const AUTH_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

type QsValue = string | number | boolean;

function qv(v: QsValue): string {
  const s = String(v);
  if (s.includes(".")) {
    const i = s.indexOf(".");
    return s.slice(0, i) + "." + encodeURIComponent(s.slice(i + 1));
  }
  return s;
}

function buildUrl(path: string, qs: Record<string, QsValue>): string {
  const parts = Object.entries(qs).map(([k, v]) => `${k}=${qv(v)}`);
  return `${SUPABASE_URL}/rest/v1/${path}${parts.length ? "?" + parts.join("&") : ""}`;
}

async function parseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Supabase invalid JSON: ${e.message} body[:200]=${text.slice(0, 200)}`);
  }
}

export async function supaGet(
  path: string,
  qs: Record<string, QsValue> = {},
): Promise<any> {
  const res = await fetch(buildUrl(path, qs), { headers: AUTH_HEADERS });
  return parseResponse(res);
}

/**
 * Exact row count for a filtered table, WITHOUT transferring the rows.
 *
 * Uses PostgREST's `Prefer: count=exact` + a `Range` of a single row, so the
 * response body is one tiny row and the count comes back in the `Content-Range`
 * header as `0-0/1234`. Use this before paging so a caller can decide whether a
 * result set is safe to fully materialise.
 *
 * Returns -1 if PostgREST did not send a parseable count (the header can come
 * back with a non-numeric total), so callers can tell "zero rows" apart from
 * "count unavailable".
 */
export async function supaCount(
  path: string,
  qs: Record<string, QsValue> = {},
): Promise<number> {
  const res = await fetch(buildUrl(path, { ...qs, select: "id", limit: 1 }), {
    headers: { ...AUTH_HEADERS, Prefer: "count=exact" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const range = res.headers.get("content-range") || "";
  const total = range.split("/")[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Fetch a bounded set of rows by paging through PostgREST in fixed-size chunks.
 *
 * WHY THIS EXISTS: `supaGet` issues an unbounded `SELECT`. PostgREST's own
 * `db-max-rows` is unset on our project, so a single call will happily stream the
 * entire table plus every embedded child row into a Vercel function that has a
 * 10-second wall clock and a fixed memory ceiling. That is fine at 47 rows and
 * fatal at 50,000. Any route that aggregates a whole table MUST come through here.
 *
 * The result is hard-capped at `maxRows`. When the cap is hit, `truncated` is
 * true and the caller is expected to tell the user their numbers cover only the
 * most recent `maxRows` records — silently reporting a partial total as if it
 * were complete is worse than refusing to answer.
 *
 * @param path     Table name, e.g. "quotations".
 * @param qs       Filters/select, e.g. `{ client_id: "eq.x", select: "id,total" }`.
 * @param pageSize Rows per HTTP round trip. 1000 is PostgREST's comfortable max.
 * @param maxRows  Absolute ceiling across all pages.
 */
export async function supaGetAllPaged(
  path: string,
  qs: Record<string, QsValue> = {},
  pageSize = 500,
  maxRows = 5000,
): Promise<{ rows: any[]; truncated: boolean }> {
  const rows: any[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const page = await supaGet(path, { ...qs, limit, offset });
    if (!Array.isArray(page) || page.length === 0) {
      return { rows, truncated: false };
    }
    rows.push(...page);
    // A short page means we reached the end of the result set.
    if (page.length < limit) {
      return { rows, truncated: false };
    }
    offset += page.length;
  }

  // We stopped because we hit maxRows, not because data ran out. Probe for one
  // more row so we only claim truncation when rows actually remain.
  const probe = await supaGet(path, { ...qs, limit: 1, offset });
  return { rows, truncated: Array.isArray(probe) && probe.length > 0 };
}

export async function supaPatch(
  path: string,
  qs: Record<string, QsValue>,
  body: Record<string, any>,
): Promise<any> {
  const res = await fetch(buildUrl(path, qs), {
    method: "PATCH",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function supaPost(
  path: string,
  body: Record<string, any>,
): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function supaDelete(
  path: string,
  qs: Record<string, QsValue>,
): Promise<any> {
  const res = await fetch(buildUrl(path, qs), {
    method: "DELETE",
    headers: AUTH_HEADERS,
  });
  return parseResponse(res);
}

export async function uploadToStorage(
  filename: string,
  binary: Uint8Array,
  mime: string,
): Promise<string> {
  const buf = Buffer.from(binary);
  const url = `${SUPABASE_URL}/storage/v1/object/assets/${filename}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { ...AUTH_HEADERS, "Content-Type": mime },
    body: buf,
  });
  if (res.status === 409) {
    res = await fetch(url, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": mime },
      body: buf,
    });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage upload ${res.status}: ${body.slice(0, 300)}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/assets/${filename}`;
}

export function uploadLogoFile(
  clientId: string,
  logoFile: { mime?: string; data: string },
  sub = "",
): Promise<string> {
  const allowedMimes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
  const mime = (logoFile.mime || "image/png").toLowerCase();
  if (!allowedMimes.has(mime)) {
    throw new Error(`Unsupported image type: ${mime}. Allowed: png, jpeg, gif, webp`);
  }
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const ext = extMap[mime] || "png";
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let binary: Uint8Array;
  try {
    const b64 = logoFile.data.includes(",") ? logoFile.data.split(",").pop()! : logoFile.data;
    binary = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("Invalid base64 image data");
  }
  if (binary.length === 0) throw new Error("Empty image file");
  if (binary.length > 2 * 1024 * 1024) throw new Error("Image too large: max 2MB");
  const isPng = binary[0] === 0x89 && binary[1] === 0x50 && binary[2] === 0x4e && binary[3] === 0x47;
  const isJpeg = binary[0] === 0xff && binary[1] === 0xd8 && binary[2] === 0xff;
  const isGif = binary[0] === 0x47 && binary[1] === 0x49 && binary[2] === 0x46 && binary[3] === 0x38;
  const isWebp = binary[0] === 0x52 && binary[1] === 0x49 && binary[2] === 0x46 && binary[3] === 0x46 && binary[8] === 0x57 && binary[9] === 0x45 && binary[10] === 0x42 && binary[11] === 0x50;
  const magicOk =
    (mime === "image/png" && isPng) ||
    ((mime === "image/jpeg" || mime === "image/jpg") && isJpeg) ||
    (mime === "image/gif" && isGif) ||
    (mime === "image/webp" && isWebp);
  if (!magicOk) {
    throw new Error(`Image content does not match declared type ${mime} (magic byte mismatch)`);
  }
  const filename = sub
    ? `logos/${safe}-${sub}.${ext}`
    : `logos/${safe}.${ext}`;
  return uploadToStorage(filename, binary, mime);
}

/**
 * Call a Supabase PostgreSQL RPC by name with a JSON params object.
 *
 * RPCs take a single JSON argument: PostgREST resolves `rpc/foo` against
 * `CREATE FUNCTION foo(json)` and forwards the body as that one parameter.
 * We send the params object directly so named keys inside it match the PG args.
 *
 * Throws on non-2xx — callers decide whether to fall back (e.g. migration not
 * yet applied) or propagate.
 */
export async function supabaseRpc(name: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(params),
  });
  return parseResponse(res);
}

export function isServiceKeyConfigured(): boolean {
  return !!SERVICE_ROLE_KEY;
}

// ============================================================================
//  Missing-column fallback
// ============================================================================
// PostgREST returns HTTP 400 with code 42703 when a query references a column
// that does not exist in the live schema. Migration 009 adds `customer_id` to
// `quotations`; until it is applied, every route that touches the column 400s.
//
// Rather than hard-coding "skip customer_id until further notice", this helper
// makes every supabase call self-healing: it tries the request as written, and
// ONLY on a 42703 does it strip the offending column from the select/body and
// retry. Once the migration lands, the first attempt succeeds and the fallback
// never fires. This keeps the column references in the routes (so they start
// working the moment the DDL is applied) while keeping the console usable today.

const UNDEFINED_COLUMN = /column [\w.]+\.(\w+) does not exist/;

function extractMissingColumn(err: any): string | null {
  const m = err?.message?.match(UNDEFINED_COLUMN);
  return m ? m[1] : null;
}

function stripColumnFromSelect(select: string, col: string): string {
  return select
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== col && s !== "")
    .join(",");
}

function stripColumnFromRecord(body: Record<string, any>, col: string): Record<string, any> {
  const next: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k !== col) next[k] = v;
  }
  return next;
}

/**
 * Like supaGet, but transparently retries without a column that does not exist.
 */
export async function supaGetSafe(
  path: string,
  qs: Record<string, QsValue> = {},
): Promise<any> {
  try {
    return await supaGet(path, qs);
  } catch (err) {
    const col = extractMissingColumn(err);
    if (!col || !qs.select) throw err;
    const cleaned = stripColumnFromSelect(String(qs.select), col);
    if (!cleaned) throw err;
    return await supaGet(path, { ...qs, select: cleaned });
  }
}

/**
 * Like supaPost, but transparently retries without a column that does not exist.
 * Handles both single-object and array (bulk insert) bodies.
 */
export async function supaPostSafe(
  path: string,
  body: Record<string, any> | Record<string, any>[],
): Promise<any> {
  try {
    return await supaPost(path, body);
  } catch (err) {
    const col = extractMissingColumn(err);
    if (!col) throw err;
    if (Array.isArray(body)) {
      return await supaPost(
        path,
        body.map((row) => stripColumnFromRecord(row, col)),
      );
    }
    return await supaPost(path, stripColumnFromRecord(body, col));
  }
}

/**
 * Like supaPatch, but transparently retries without a column that does not exist.
 */
export async function supaPatchSafe(
  path: string,
  qs: Record<string, QsValue>,
  body: Record<string, any>,
): Promise<any> {
  try {
    return await supaPatch(path, qs, body);
  } catch (err) {
    const col = extractMissingColumn(err);
    if (!col) throw err;
    return await supaPatch(path, qs, stripColumnFromRecord(body, col));
  }
}
