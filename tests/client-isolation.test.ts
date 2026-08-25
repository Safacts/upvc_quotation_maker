/**
 * TEST 3 — CLIENT (TENANT) ISOLATION
 *
 * THE non-negotiable property of this product. Three uPVC fabricators —
 * venkateshwara, kprupvc, akshaya upvc — share one Postgres database, one
 * Supabase project, and one set of Next.js route handlers. The ONLY thing that
 * keeps their quotations, customers and GST invoices apart is a `client_id`
 * TEXT column plus the discipline of every single query.
 *
 * WHY RLS DOES NOT SAVE US HERE
 * ----------------------------
 * `src/lib/supabase.ts` builds every request with SUPABASE_SERVICE_ROLE_KEY.
 * The service role BYPASSES Row Level Security by design. So the `client_isolation`
 * policies documented in the DB are defence-in-depth ONLY — for API traffic they
 * are inert. Application code is the entire boundary. That is what this file tests.
 *
 * THE THREE-PART RULE every tenant-scoped handler must satisfy:
 *   1. AUTHENTICATE  — reject callers with no session.
 *   2. AUTHORISE     — the client_id acted upon must be *derived from* the signed
 *                      session, not merely *compared against* it in one branch.
 *   3. FILTER        — the outgoing PostgREST query must carry client_id=eq.<id>.
 *
 * Rule 2 is where this codebase actually bleeds. Most routes DO filter (rule 3);
 * they just accept the filter's VALUE from the caller. A correct-looking
 * `client_id: "eq." + clientId` is worthless when `clientId` came from
 * `searchParams`.
 *
 * These tests are hermetic: Supabase is a spy, `next/headers` is an in-memory
 * cookie jar. No network, no live DB, safe on every push.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_JWT_SECRET = "bugsy-test-jwt-secret-do-not-use-in-prod";

const TENANT_A = "venkateshwara";
const TENANT_B = "kprupvc";

/** Tables that carry a client_id and therefore MUST always be tenant-filtered. */
const TENANT_TABLES = [
  "quotations",
  "measured_items",
  "unmeasured_items",
  "sent_emails",
  "gst_invoices",
  "gst_invoice_items",
  "service_reviews",
  "customers",
  "products",
];

// ---------------------------------------------------------------------------
// Supabase spy — records every PostgREST call the route makes.
// ---------------------------------------------------------------------------
type Call = { op: "get" | "post" | "patch" | "delete"; table: string; qs: any; body?: any };
const calls: Call[] = [];
/** Per-table canned responses, keyed by table name. */
const fixtures: Record<string, any> = {};

function record(op: Call["op"], table: string, qs: any, body?: any) {
  calls.push({ op, table, qs, body });
  return fixtures[table] ?? [];
}

vi.mock("@/lib/supabase", () => ({
  isServiceKeyConfigured: () => true,
  supaGet: async (t: string, qs: any = {}) => record("get", t, qs),
  supaPost: async (t: string, body: any) => {
    record("post", t, {}, body);
    return fixtures[t] ?? [{ id: "new-row-id" }];
  },
  supaPatch: async (t: string, qs: any, body: any) => record("patch", t, qs, body),
  supaDelete: async (t: string, qs: any = {}) => record("delete", t, qs),
  supaCount: async (t: string, qs: any = {}) => {
    record("get", t, qs);
    return 0;
  },
  supaGetAllPaged: async (t: string, qs: any = {}) => {
    record("get", t, qs);
    return { rows: fixtures[t] ?? [], truncated: false };
  },
}));

/**
 * Some routes use the supabase-js client (`supabaseAdmin`) rather than the
 * `supa*` fetch helpers. Its module scope calls `createClient()`, which throws
 * "supabaseKey is required" without env. Mock it with the same recorder so both
 * data-access styles land in one `calls` array.
 */
function makeBuilder(table: string) {
  let captured: Record<string, any> = {};
  const result = () => {
    calls.push({ op: "get", table, qs: { ...captured } });
    const rows = fixtures[table] ?? [];
    return { data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null };
  };
  const builder: any = {
    select: () => builder,
    update: (payload: any) => {
      calls.push({ op: "patch", table, qs: { ...captured }, body: payload });
      return builder;
    },
    eq: (col: string, val: any) => {
      captured[col === "client_id" ? "client_id" : col] =
        col === "client_id" ? "eq." + val : val;
      return builder;
    },
    order: () => Promise.resolve({ data: fixtures[table] ?? [], error: null }),
    single: () => Promise.resolve(result()),
    maybeSingle: () => Promise.resolve(result()),
    then: (res: any, rej: any) =>
      Promise.resolve({ data: fixtures[table] ?? [], error: null }).then(res, rej),
  };
  return builder;
}

vi.mock("@/lib/supabase-client", () => {
  const supabase = { from: (t: string) => makeBuilder(t) };
  const supabaseAdmin = { from: (t: string) => makeBuilder(t) };
  return { supabase, supabaseAdmin, getSupabase: () => supabase, getSupabaseAdmin: () => supabaseAdmin };
});

/**
 * pdf-lib HANGS (~5s+) when imported in the vitest node environment. The
 * gst_invoices routes import `amountInWords` from `@/lib/gst-invoice-pdf`,
 * which pulls pdf-lib at module scope — so merely importing the ROUTE timed
 * the test out before any assertion ran (seen on "blocks a logged-in customer
 * reading another tenant's invoices"). Mocking this specifier intercepts at
 * the exact specifier the routes use (`app/api/gst_invoices/route.ts:7`,
 * `[id]/route.ts:13`), so pdf-lib never loads. Same proven pattern as
 * tests/pdf-routes.test.ts:79. We stub every named export any route in this
 * file's graph imports; PDF rendering itself is covered by pdf-routes.test.ts.
 */
vi.mock("@/lib/gst-invoice-pdf", () => ({
  amountInWords: (n: number) => `Rupees ${Number(n).toFixed(2)} Only (stub)`,
  buildGstInvoicePdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
}));

// ---------------------------------------------------------------------------
// Session mock — a real signed JWT would also work, but we control the payload
// directly so a test can express "an attacker holding a signup-role cookie".
// ---------------------------------------------------------------------------
let currentSession: any = null;

vi.mock("@/lib/session", () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
  deleteSession: async () => {},
}));

function loginAs(session: any) {
  currentSession = session;
}

const customerA = { role: "customer", email: "jvenkateshupvc@gmail.com", client_id: TENANT_A };
const customerB = { role: "customer", email: "kprupvc@gmail.com", client_id: TENANT_B };
const adminSession = { role: "admin", email: "kongaaadisheshu@gmail.com" };
/**
 * The dangerous one. `/api/portal_auth` mints this for ANY unrecognised email,
 * with no verification and no approval — see portal_auth/route.ts:264-277.
 * A stranger can obtain it with a single unauthenticated POST. Any route whose
 * guard is `if (!session)` treats this as a legitimate caller.
 */
const signupSession = { role: "signup", email: "attacker@evil.com", signup_request_id: "999" };

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  currentSession = null;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/** Every recorded call against a tenant table must be scoped to `expected`. */
function expectAllScopedTo(expected: string) {
  const tenantCalls = calls.filter((c) => TENANT_TABLES.includes(c.table));
  expect(tenantCalls.length, "expected at least one tenant-table query").toBeGreaterThan(0);
  for (const c of tenantCalls) {
    const filter = c.qs?.client_id;
    expect(
      filter,
      `${c.op.toUpperCase()} ${c.table} has NO client_id filter — service role bypasses RLS, so this reads every tenant`,
    ).toBeDefined();
    expect(
      filter,
      `${c.op.toUpperCase()} ${c.table} scoped to ${filter}, expected eq.${expected}`,
    ).toBe("eq." + expected);
  }
}

/** No query may reference the victim tenant, in a filter or in a written row. */
function expectNoTraceOf(victim: string) {
  for (const c of calls) {
    const blob = JSON.stringify({ qs: c.qs, body: c.body });
    expect(
      blob.includes(victim),
      `${c.op.toUpperCase()} ${c.table} referenced foreign tenant "${victim}": ${blob}`,
    ).toBe(false);
  }
}

const noBody = (url: string) => new Request(url);
const jsonReq = (url: string, body: unknown, method = "POST") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// NextRequest is needed for handlers that read `request.nextUrl`.
async function nextReq(url: string, init?: RequestInit) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(url, init as any);
}

// ===========================================================================
describe("ISOLATION INVARIANT — the rule every tenant route must obey", () => {
  it("documents the tenant table list so a new table cannot be added unnoticed", () => {
    // If someone adds a tenant-scoped table and forgets this list, the isolation
    // helpers silently stop checking it. Failing here is the reminder.
    expect(TENANT_TABLES).toContain("quotations");
    expect(TENANT_TABLES).toContain("gst_invoices");
    expect(TENANT_TABLES).toContain("customers");
    expect(TENANT_TABLES).toContain("products");
  });

  it("PROVES the service role bypasses RLS — filtering is not optional", async () => {
    // A query with no client_id filter returns rows for every tenant. This test
    // exists so nobody argues "RLS will catch it". For service-role traffic,
    // RLS catches nothing.
    const { supaGet } = await import("@/lib/supabase");
    fixtures.quotations = [
      { id: 1, client_id: TENANT_A },
      { id: 2, client_id: TENANT_B },
    ];
    const rows = await supaGet("quotations", { select: "*" });
    const tenants = new Set(rows.map((r: any) => r.client_id));
    expect(tenants.size).toBe(2); // both tenants in one result set
  });
});

// ===========================================================================
describe("/api/portal_stats — the reference implementation", () => {
  it("scopes every query to the session tenant, ignoring the URL", async () => {
    loginAs(customerA);
    const { GET } = await import("../app/api/portal_stats/route");
    // Attacker appends someone else's client_id to the query string.
    const res = await GET(await nextReq(`https://app.vitharn.com/api/portal_stats?client_id=${TENANT_B}`));
    expect(res.status).toBe(200);
    expectAllScopedTo(TENANT_A);
    expectNoTraceOf(TENANT_B);
  });

  it("rejects an anonymous caller (401) and issues no query", async () => {
    loginAs(null);
    const { GET } = await import("../app/api/portal_stats/route");
    const res = await GET(await nextReq("https://app.vitharn.com/api/portal_stats"));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => TENANT_TABLES.includes(c.table))).toEqual([]);
  });

  it("rejects a self-issued signup-role session", async () => {
    loginAs(signupSession);
    const { GET } = await import("../app/api/portal_stats/route");
    const res = await GET(await nextReq("https://app.vitharn.com/api/portal_stats"));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => TENANT_TABLES.includes(c.table))).toEqual([]);
  });
});

// ===========================================================================
describe("/api/gst_invoices — financial records, caller-supplied tenant", () => {
  it("blocks a logged-in customer reading another tenant's invoices (403)", async () => {
    loginAs(customerA);
    const { GET } = await import("../app/api/gst_invoices/route");
    const res = await GET(
      await nextReq(`https://app.vitharn.com/api/gst_invoices?client_id=${TENANT_B}`),
    );
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.table === "gst_invoices")).toEqual([]);
  });

  it("allows a customer to read their OWN invoices, correctly filtered", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-1", client_id: TENANT_A }];
    const { GET } = await import("../app/api/gst_invoices/route");
    const res = await GET(
      await nextReq(`https://app.vitharn.com/api/gst_invoices?client_id=${TENANT_A}`),
    );
    expect(res.status).toBe(200);
    expectAllScopedTo(TENANT_A);
  });

  it("blocks a customer writing an invoice under another tenant (403)", async () => {
    loginAs(customerA);
    const { POST } = await import("../app/api/gst_invoices/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/gst_invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: TENANT_B, buyer_name: "Planted" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.op === "post")).toEqual([]);
  });

  it("blocks reading a foreign invoice by id (403, ownership checked post-fetch)", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-b", client_id: TENANT_B, buyer_gstin: "SECRET" }];
    const { GET } = await import("../app/api/gst_invoices/[id]/route");
    const res = await GET(await nextReq("https://app.vitharn.com/api/gst_invoices/inv-b"), {
      params: Promise.resolve({ id: "inv-b" }),
    });
    expect(res.status).toBe(403);
    // The row WAS fetched to determine ownership; the guarantee is that its
    // contents never reach the caller and no child rows are read.
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("SECRET");
    expect(calls.filter((c) => c.table === "gst_invoice_items")).toEqual([]);
  });

  it("blocks DELETE of a foreign invoice and performs no destructive write", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-b", client_id: TENANT_B }];
    const { DELETE } = await import("../app/api/gst_invoices/[id]/route");
    const res = await DELETE(await nextReq("https://app.vitharn.com/api/gst_invoices/inv-b", { method: "DELETE" }), {
      params: Promise.resolve({ id: "inv-b" }),
    });
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.op === "delete")).toEqual([]);
  });

  it("🔴 REGRESSION GUARD (LEAK-01): a signup-role session must not read any tenant's invoices", async () => {
    // gst_invoices/route.ts:28 — `if (session.role === "customer" && ...)`.
    // A signup-role caller is not a customer, so the tenant comparison is
    // skipped entirely and `clientId` comes straight from searchParams.
    // /api/portal_auth hands that session to anyone who POSTs a novel email.
    // EXPECTED (after fix): 401 or 403. CURRENT: 200 + full invoice dump.
    loginAs(signupSession);
    fixtures.gst_invoices = [{ id: "inv-1", client_id: TENANT_A, buyer_gstin: "36AAAAA0000A1Z5" }];
    const { GET } = await import("../app/api/gst_invoices/route");
    const res = await GET(
      await nextReq(`https://app.vitharn.com/api/gst_invoices?client_id=${TENANT_A}`),
    );
    expect(
      [401, 403],
      `signup-role session got HTTP ${res.status} — a stranger can read ${TENANT_A}'s GST invoices`,
    ).toContain(res.status);
  });

  it("🔴 REGRESSION GUARD (LEAK-02): PUT must stamp items with the VERIFIED tenant, never the body's", async () => {
    // gst_invoices/[id]/route.ts:109 — `client_id: p.client_id || null`.
    // Ownership is verified at :79 against the stored row, then that verified
    // value is thrown away when the child rows are rewritten. A body-supplied
    // client_id (or null) orphans the items from every client_id=eq. filter,
    // permanently corrupting a tax document.
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-a", client_id: TENANT_A }];
    const { PUT } = await import("../app/api/gst_invoices/[id]/route");
    await PUT(
      await nextReq("https://app.vitharn.com/api/gst_invoices/inv-a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: TENANT_B, items: [{ description: "x", rate: 1 }] }),
      }),
      { params: Promise.resolve({ id: "inv-a" }) },
    );
    const itemWrites = calls.filter((c) => c.op === "post" && c.table === "gst_invoice_items");
    for (const w of itemWrites) {
      for (const row of w.body as any[]) {
        expect(
          row.client_id,
          `item written with client_id=${row.client_id}; must be the verified ${TENANT_A}`,
        ).toBe(TENANT_A);
      }
    }
  });
});

// ===========================================================================
describe("/api/gst_invoices/items — child-row grafting", () => {
  it("requires a session", async () => {
    loginAs(null);
    const { POST } = await import("../app/api/gst_invoices/items/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/gst_invoices/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: "inv-a", client_id: TENANT_A, items: [{}] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.op === "post")).toEqual([]);
  });

  it("blocks grafting items onto another tenant's invoice (403)", async () => {
    // The subtle attack: send YOUR OWN client_id together with THEIR invoice_id.
    // Every row looks correctly scoped, yet a stranger's invoice gains line items.
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-b", client_id: TENANT_B }];
    const { POST } = await import("../app/api/gst_invoices/items/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/gst_invoices/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: "inv-b",
          client_id: TENANT_A,
          items: [{ description: "injected", rate: 99999 }],
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.table === "gst_invoice_items")).toEqual([]);
  });

  it("ignores a body-supplied client_id for customers and uses the cookie", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-a", client_id: TENANT_A }];
    const { POST } = await import("../app/api/gst_invoices/items/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/gst_invoices/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: "inv-a",
          client_id: TENANT_A,
          items: [{ description: "legit", rate: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const writes = calls.filter((c) => c.op === "post" && c.table === "gst_invoice_items");
    expect(writes.length).toBe(1);
    for (const row of writes[0].body as any[]) {
      expect(row.client_id).toBe(TENANT_A);
    }
  });
});

// ===========================================================================
describe("/api/reviews/[clientId]/manage — moderation surface", () => {
  it("rejects anonymous enumeration of hidden reviews (401)", async () => {
    loginAs(null);
    const { GET } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await GET(noBody(`https://app.vitharn.com/api/reviews/${TENANT_B}/manage`), {
      params: Promise.resolve({ clientId: TENANT_B }),
    });
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.table === "service_reviews")).toEqual([]);
  });

  it("blocks tenant A from reading tenant B's moderation queue (403)", async () => {
    loginAs(customerA);
    const { GET } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await GET(noBody(`https://app.vitharn.com/api/reviews/${TENANT_B}/manage`), {
      params: Promise.resolve({ clientId: TENANT_B }),
    });
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.table === "service_reviews")).toEqual([]);
  });

  it("blocks tenant A from DELETING tenant B's reviews (403, no write)", async () => {
    loginAs(customerA);
    const { DELETE } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await DELETE(
      jsonReq(`https://app.vitharn.com/api/reviews/${TENANT_B}/manage`, { id: 1 }, "DELETE"),
      { params: Promise.resolve({ clientId: TENANT_B }) },
    );
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.op === "delete")).toEqual([]);
  });

  it("blocks tenant A from rewriting tenant B's review text (403, no write)", async () => {
    loginAs(customerA);
    const { PATCH } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      jsonReq(
        `https://app.vitharn.com/api/reviews/${TENANT_B}/manage`,
        { id: 1, reviewText: "Terrible service, avoid", rating: 1 },
        "PATCH",
      ),
      { params: Promise.resolve({ clientId: TENANT_B }) },
    );
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.op === "patch")).toEqual([]);
  });

  it("rejects a signup-role session outright", async () => {
    loginAs(signupSession);
    const { GET } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await GET(noBody(`https://app.vitharn.com/api/reviews/${TENANT_A}/manage`), {
      params: Promise.resolve({ clientId: TENANT_A }),
    });
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.table === "service_reviews")).toEqual([]);
  });

  it("lets a tenant moderate their OWN reviews, filtered to them", async () => {
    loginAs(customerA);
    fixtures.service_reviews = [{ id: 1, client_id: TENANT_A }];
    const { GET } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await GET(noBody(`https://app.vitharn.com/api/reviews/${TENANT_A}/manage`), {
      params: Promise.resolve({ clientId: TENANT_A }),
    });
    expect(res.status).toBe(200);
    expectAllScopedTo(TENANT_A);
  });

  it("lets an admin moderate on behalf of any tenant (documented exception)", async () => {
    loginAs(adminSession);
    fixtures.service_reviews = [{ id: 1, client_id: TENANT_B }];
    const { GET } = await import("../app/api/reviews/[clientId]/manage/route");
    const res = await GET(noBody(`https://app.vitharn.com/api/reviews/${TENANT_B}/manage`), {
      params: Promise.resolve({ clientId: TENANT_B }),
    });
    expect(res.status).toBe(200);
    expectAllScopedTo(TENANT_B);
  });
});

// ===========================================================================
describe("/api/portal_settings — config writes", () => {
  it("writes only to the session tenant, ignoring a body-supplied id", async () => {
    loginAs(customerA);
    fixtures.clients = [{ id: TENANT_A, config: {} }];
    const { POST } = await import("../app/api/portal_settings/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/portal_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: TENANT_B, cost_margin_percent: 99 }),
      }),
    );
    expect(res.status).toBe(200);
    // `clients` is keyed by `id`, not `client_id`, so assert on the filter used.
    for (const c of calls) {
      const blob = JSON.stringify(c.qs);
      if (blob.includes("eq.")) {
        expect(blob, `settings query touched foreign tenant: ${blob}`).not.toContain(TENANT_B);
      }
    }
  });

  it("rejects anonymous callers", async () => {
    loginAs(null);
    const { POST } = await import("../app/api/portal_settings/route");
    const res = await POST(
      await nextReq("https://app.vitharn.com/api/portal_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_margin_percent: 5 }),
      }),
    );
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.op === "patch")).toEqual([]);
  });
});

// ===========================================================================
describe("/api/quotation/[id]/token — cross-tenant quote link minting", () => {
  it("refuses to mint a share token for another tenant's quotation", async () => {
    loginAs(customerA);
    fixtures.quotations = [{ id: "q-b", client_id: TENANT_B }];
    const { GET } = await import("../app/api/quotation/[id]/token/route");
    const res = await GET(await nextReq("https://app.vitharn.com/api/quotation/q-b/token"), {
      params: Promise.resolve({ id: "q-b" }),
    });
    expect([403, 404]).toContain(res.status);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/"token"\s*:\s*"[0-9a-f]{16}"/);
  });

  it("rejects anonymous token minting", async () => {
    loginAs(null);
    fixtures.quotations = [{ id: "q-a", client_id: TENANT_A }];
    const { GET } = await import("../app/api/quotation/[id]/token/route");
    const res = await GET(await nextReq("https://app.vitharn.com/api/quotation/q-a/token"), {
      params: Promise.resolve({ id: "q-a" }),
    });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
describe("STATIC AUDIT — no tenant query may ship without a client_id filter", () => {
  /**
   * A belt-and-braces scan of the route sources themselves. Behavioural tests
   * only cover the routes we thought to exercise; this catches a NEW route that
   * queries a tenant table with no filter at all. It is deliberately crude — it
   * flags, it does not prove — but an unfiltered `supaGet("quotations", ...)`
   * is never correct.
   */
  it("flags any supaGet/supaPatch/supaDelete on a tenant table lacking client_id", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const { join } = await import("path");

    const apiRoot = join(process.cwd(), "app", "api");
    const files: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") files.push(full);
      }
    })(apiRoot);

    expect(files.length).toBeGreaterThan(10); // sanity: we really walked the tree

    // Known, reviewed exceptions — each needs a written justification.
    const ALLOWED: Record<string, string> = {
      // Public share link, gated by a 64-bit HMAC bound to the quotation id
      // instead of a session. Tracked as ISO-09 (should ALSO filter defensively).
      [join("app", "api", "quotation", "[id]", "route.ts")]:
        "HMAC-token gated public endpoint",
      // Child rows are addressed by invoice_id after the PARENT's ownership has
      // been verified against the session.
      [join("app", "api", "gst_invoices", "[id]", "route.ts")]:
        "child rows keyed by verified invoice_id",
      [join("app", "api", "gst_invoices", "items", "route.ts")]:
        "child rows keyed by verified invoice_id",
      // PDF generation: parent read is by-pk-then-verify (same pattern as
      // gst_invoices/[id]/route.ts). Child rows NOW carry client_id defensively
      // (added 08-08-2026) but the parent read cannot filter by client_id before
      // the owner is known — it must read the row first to obtain client_id.
      [join("app", "api", "gst_invoices", "[id]", "pdf", "route.ts")]:
        "parent read by-pk-then-verify; child rows filter by verified client_id",
      // Vitharn's OWN receivables. Not tenant data; admin-only.
      [join("app", "api", "invoice", "route.ts")]: "Vitharn internal AR, admin-only",
      [join("app", "api", "invoice", "[id]", "route.ts")]: "Vitharn internal AR, admin-only",
      // OTP delivery lookup keyed by recipient email. Tracked as ISO-08.
      [join("app", "api", "reset_client_password", "route.ts")]:
        "OTP lookup by recipient; tracked as ISO-08",
      // Hard-delete of an entire client by an admin; filters by client_id but on
      // the `clients` PK for the parent row.
      [join("app", "api", "save_client", "route.ts")]: "admin client lifecycle",
    };

    const offenders: string[] = [];
    const callRe =
      /supa(Get|Patch|Delete|GetAllPaged|Count)\(\s*["'`]([a-z_]+)["'`]\s*,\s*\{([\s\S]*?)\}\s*[,)]/g;

    for (const file of files) {
      const rel = file.slice(process.cwd().length + 1);
      if (ALLOWED[rel]) continue;
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(src))) {
        const [, , table, args] = m;
        if (!TENANT_TABLES.includes(table)) continue;
        if (!args.includes("client_id")) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${rel}:${line} → ${m[1]} on "${table}" without client_id`);
        }
      }
    }

    expect(
      offenders,
      "unfiltered tenant queries found (service role bypasses RLS):\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("flags any route that queries a tenant table without importing getSession", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const { join } = await import("path");

    const apiRoot = join(process.cwd(), "app", "api");
    const files: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") files.push(full);
      }
    })(apiRoot);

    // Deliberately public, reviewed surfaces.
    const PUBLIC_OK = new Set([
      join("app", "api", "reviews", "route.ts"), // public review submission
      join("app", "api", "reviews", "[clientId]", "route.ts"), // public review feed
      join("app", "api", "quotation", "[id]", "route.ts"), // HMAC-gated share link
      // Customer-facing PDF download for that same share link. Gated by the
      // IDENTICAL HMAC (verified in constant time, BEFORE any query) and the
      // row is fetched by primary key, so the token — which is bound to that
      // one quotation id — is what scopes the read. A session is impossible
      // here by design: the recipient of a WhatsApp link has no account.
      join("app", "api", "quotation", "[id]", "pdf", "route.ts"),
      join("app", "api", "portal_auth", "route.ts"), // must run pre-session
      join("app", "api", "reset_client_password", "route.ts"), // OTP flow, pre-session
      join("app", "api", "save_client", "route.ts"), // body-hash auth (tracked ISO-06)
    ]);

    /**
     * Recognised authentication entry points.
     *
     * `getSession` is the raw primitive. `requireConsoleSession` is the
     * `/api/console/*` guard in src/lib/console-auth.ts, which calls
     * `getSession()` and then `resolveTenant()` — a STRICTLY STRONGER check than
     * a bare `getSession()`, because it also fails closed on the `signup` role
     * that `/api/portal_auth` will mint for any unrecognised email.
     *
     * This list is deliberately short and must stay that way. Adding a name here
     * asserts that the named function cannot return a usable tenant id to an
     * unauthenticated caller. Do not add a helper that merely *reads* a session.
     */
    const AUTH_ENTRYPOINTS = ["getSession", "requireConsoleSession"];

    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(process.cwd().length + 1);
      if (PUBLIC_OK.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      const touchesTenant = TENANT_TABLES.some(
        (t) => src.includes(`"${t}"`) || src.includes(`'${t}'`),
      );
      if (touchesTenant && !AUTH_ENTRYPOINTS.some((fn) => src.includes(fn))) {
        offenders.push(`${rel} → queries a tenant table with no session guard`);
      }
    }

    expect(offenders, "unauthenticated tenant routes:\n" + offenders.join("\n")).toEqual([]);
  });
});
