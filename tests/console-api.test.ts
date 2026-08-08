/**
 * CONSOLE API — tenant isolation, validation and money correctness
 *
 * Covers the `/api/console/*` surface added in Phase 1 of the desktop dashboard.
 *
 * WHY A DEDICATED FILE: `client-isolation.test.ts` proves the pre-existing
 * routes are safe and ends with a crude static grep. That grep flags a missing
 * filter but cannot prove the filter's VALUE is derived from the session rather
 * than from attacker input — which is the defect class that actually shipped
 * twice in this repo (`/api/gst_invoices/items` and
 * `/api/reviews/[clientId]/manage`, both exploitable in production until
 * 08-08-2026). These are behavioural tests: they drive the real handlers and
 * assert on the exact PostgREST calls that come out.
 *
 * Hermetic — Supabase is a spy, the session is an in-memory object. No network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const TENANT_A = "venkateshwara";
const TENANT_B = "kprupvc";

const TENANT_TABLES = [
  "quotations",
  "measured_items",
  "unmeasured_items",
  "customers",
  "products",
];

// ---------------------------------------------------------------------------
// Supabase spy
// ---------------------------------------------------------------------------
type Call = { op: "get" | "post" | "patch" | "delete"; table: string; qs: any; body?: any };
const calls: Call[] = [];
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
    return fixtures[t + ":insert"] ?? [{ id: "new-quote-id", quote_no: "Q-1" }];
  },
  supaPatch: async (t: string, qs: any, body: any) => record("patch", t, qs, body),
  supaDelete: async (t: string, qs: any = {}) => record("delete", t, qs),
  supaCount: async (t: string, qs: any = {}) => {
    record("get", t, qs);
    return fixtures[t + ":count"] ?? 0;
  },
  supaGetAllPaged: async (t: string, qs: any = {}) => {
    record("get", t, qs);
    return { rows: fixtures[t] ?? [], truncated: false };
  },
}));

let currentSession: any = null;
vi.mock("@/lib/session", () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
  deleteSession: async () => {},
}));

const customerA = { role: "customer", email: "a@example.com", client_id: TENANT_A };
const customerB = { role: "customer", email: "b@example.com", client_id: TENANT_B };
const adminSession = { role: "admin", email: "admin@vitharn.com" };
/**
 * `/api/portal_auth` mints this for ANY unrecognised email with no verification
 * (portal_auth/route.ts:264-277). A stranger gets one with a single POST, so
 * every guard written as `if (!session)` lets them straight through.
 */
const signupSession = { role: "signup", email: "attacker@evil.com", signup_request_id: "9" };

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  currentSession = null;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function nextReq(url: string, init?: RequestInit) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(url, init as any);
}

const jsonInit = (body: unknown, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Every tenant-table call must be scoped to exactly `expected`. */
function expectAllScopedTo(expected: string) {
  const tenantCalls = calls.filter((c) => TENANT_TABLES.includes(c.table));
  expect(tenantCalls.length, "expected at least one tenant-table query").toBeGreaterThan(0);
  for (const c of tenantCalls) {
    expect(
      c.qs?.client_id,
      `${c.op.toUpperCase()} ${c.table} has NO client_id filter — the service role bypasses RLS`,
    ).toBe("eq." + expected);
  }
}

/** No call may mention the victim tenant, in a filter or in a written row. */
function expectNoTraceOf(victim: string) {
  for (const c of calls) {
    const blob = JSON.stringify({ qs: c.qs, body: c.body });
    expect(
      blob.includes(victim),
      `${c.op.toUpperCase()} ${c.table} referenced foreign tenant "${victim}": ${blob}`,
    ).toBe(false);
  }
}

// ===========================================================================
describe("GET /api/console/quotations — the grid", () => {
  it("rejects an anonymous caller and issues no query", async () => {
    const { GET } = await import("@/../app/api/console/quotations/route");
    const res = await GET(await nextReq("http://x/api/console/quotations"));
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("rejects a self-issued signup-role session", async () => {
    // The regression that matters most: `signup` is a PRE-ACCOUNT role. It must
    // never satisfy a data-route guard, however valid its signature.
    currentSession = signupSession;
    const { GET } = await import("@/../app/api/console/quotations/route");
    const res = await GET(await nextReq("http://x/api/console/quotations"));
    expect(res.status).toBe(403);
    expect(calls.length).toBe(0);
  });

  it("scopes every query to the session tenant and IGNORES ?client_id=", async () => {
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    // Tenant A asks for tenant B's data explicitly.
    const res = await GET(
      await nextReq(`http://x/api/console/quotations?client_id=${TENANT_B}`),
    );
    // resolveTenant() 403s on a mismatch rather than silently using the session
    // id — a silent override would hide an attack in progress.
    expect(res.status).toBe(403);
    expectNoTraceOf(TENANT_B);
  });

  it("applies the tenant filter to BOTH the count and the page query", async () => {
    // A count that is not filtered reports another tenant's row total in the
    // pager — a small leak that reveals a competitor's business volume.
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    await GET(await nextReq("http://x/api/console/quotations"));
    expectAllScopedTo(TENANT_A);
    expect(calls.filter((c) => c.table === "quotations").length).toBe(2); // count + page
  });

  it("orders by a deterministic tiebreaker so offset paging cannot skip rows", async () => {
    // Without the secondary `id` key, rows sharing a created_at (bulk imports,
    // same-second saves) swap between pages: one quote is counted twice and
    // another is never shown.
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    await GET(await nextReq("http://x/api/console/quotations"));
    const page = calls.find((c) => c.table === "quotations" && c.qs.select);
    expect(page!.qs.order).toContain("id.desc");
  });

  it("rejects an unknown sort column instead of interpolating it", async () => {
    // The sort value reaches PostgREST's `order=` clause. A closed set is the
    // only safe design; zod's `.catch()` falls back rather than passing it on.
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    await GET(
      await nextReq("http://x/api/console/quotations?sort=grand_total;drop%20table"),
    );
    const page = calls.find((c) => c.table === "quotations" && c.qs.select);
    expect(page!.qs.order).toBe("created_at.desc,id.desc");
  });

  it("matches BOTH 'draft' and legacy 'Draft' when filtering by status", async () => {
    // Verified in the live table 08-08-2026: `SELECT DISTINCT status` returns
    // ["Draft","draft","sent","won"]. PostgREST `in.()` is case-sensitive, so a
    // lowercase-only filter silently hides the legacy rows — the user sees a
    // grid missing quotations they know exist, with no error.
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    await GET(await nextReq("http://x/api/console/quotations?status=draft"));
    const page = calls.find((c) => c.table === "quotations" && c.qs.select);
    expect(page!.qs.status).toContain("draft");
    expect(page!.qs.status).toContain("Draft");
  });

  it("computes money with pricing.ts, not an inline formula", async () => {
    currentSession = customerA;
    fixtures.quotations = [
      {
        id: "q1",
        quote_no: "Q-1",
        status: "sent",
        transport_cost: 2500,
        include_gst: true,
        gst_percentage: 18,
        measured_items: [{ width: 1200, height: 1500, units: 2, rate: 450 }],
        unmeasured_items: [],
      },
    ];
    const { GET } = await import("@/../app/api/console/quotations/route");
    const res = await GET(await nextReq("http://x/api/console/quotations"));
    const body = await res.json();

    const { quotationTotals } = await import("@/lib/pricing");
    const expected = quotationTotals(
      { transport_cost: 2500, include_gst: true, gst_percentage: 18 },
      [{ width: 1200, height: 1500, units: 2, rate: 450 }],
      [],
    );
    // Object.is, not an epsilon. A paisa of drift between the console and the
    // customer's PDF is a trust-killer, and epsilon comparisons hide exactly
    // that class of bug.
    expect(body.rows[0].grand_total).toBe(expected.grandTotal);
    expect(body.rows[0].net_total).toBe(expected.netTotal);
  });

  it("sends no wildcard CORS header (console is same-origin only)", async () => {
    // The Flutter endpoints need `*` because Dart calls them cross-context. The
    // console does not — and a tenant's whole commercial history must not be
    // readable by any page the user happens to have open.
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/quotations/route");
    const res = await GET(await nextReq("http://x/api/console/quotations"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

// ===========================================================================
describe("POST /api/console/quotations — create", () => {
  it("stamps the row with the SESSION tenant, ignoring a body client_id", async () => {
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/quotations/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/quotations",
        jsonInit({ client_id: TENANT_B, customer_name: "Ravi", measured_items: [] }),
      ),
    );
    // A customer naming a different tenant is a 403, not a silent correction.
    expect(res.status).toBe(403);
    expectNoTraceOf(TENANT_B);
  });

  it("writes client_id onto CHILD rows too", async () => {
    // measured_items / unmeasured_items each carry their own client_id and their
    // own RLS policy. A NULL there makes the row invisible to the anon-key path
    // the Flutter app still uses — the line item vanishes from the mobile PDF.
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/quotations/route");
    await POST(
      await nextReq(
        "http://x/api/console/quotations",
        jsonInit({
          customer_name: "Ravi",
          measured_items: [{ width: 1200, height: 1500, units: 1, rate: 450 }],
          unmeasured_items: [{ description: "Mesh", units: 2, rate: 300 }],
        }),
      ),
    );
    const measured = calls.find((c) => c.table === "measured_items" && c.op === "post");
    const unmeasured = calls.find((c) => c.table === "unmeasured_items" && c.op === "post");
    expect(measured!.body[0].client_id).toBe(TENANT_A);
    expect(unmeasured!.body[0].client_id).toBe(TENANT_A);
  });

  it("rejects a missing customer name with a per-field error", async () => {
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/quotations/route");
    const res = await POST(
      await nextReq("http://x/api/console/quotations", jsonInit({ customer_name: "  " })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // Field-level errors let the editor highlight the offending cell. A bare
    // "Validation failed" on a 30-line quotation makes the user hunt.
    expect(body.fields.customer_name).toBeTruthy();
  });

  it("rejects a negative rate rather than clamping it", async () => {
    // A negative rate silently reduces a grand total. That is a fraud vector,
    // not a typo to helpfully correct.
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/quotations/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/quotations",
        jsonInit({
          customer_name: "Ravi",
          measured_items: [{ width: 100, height: 100, units: 1, rate: -500 }],
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("refuses to link a customer_id belonging to another tenant", async () => {
    // THE PARENT-OWNERSHIP BUG, in its quotation form. A legitimately logged-in
    // user passes their OWN session but a STRANGER's customer_id; without this
    // check the row looks perfectly scoped while pointing at someone else's
    // master record. This is exactly how /api/gst_invoices/items was exploitable.
    currentSession = customerA;
    fixtures.customers = []; // the lookup, scoped to A, finds nothing
    const { POST } = await import("@/../app/api/console/quotations/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/quotations",
        jsonInit({
          customer_name: "Ravi",
          customer_id: "11111111-2222-3333-4444-555555555555",
        }),
      ),
    );
    expect(res.status).toBe(404);
    // And crucially: nothing was written before the check.
    expect(calls.some((c) => c.table === "quotations" && c.op === "post")).toBe(false);
  });

  it("rejects a customer_id that is not a uuid", async () => {
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/quotations/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/quotations",
        jsonInit({ customer_name: "Ravi", customer_id: "not-a-uuid" }),
      ),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
describe("/api/console/quotations/[id] — ownership on a path-supplied id", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("returns 404 (not 403) for another tenant's quotation", async () => {
    // 403 would confirm "this id exists but is not yours" — an enumeration
    // oracle letting a competitor count another fabricator's quotations. A
    // missing row and a forbidden row must be indistinguishable from outside.
    currentSession = customerA;
    fixtures.quotations = []; // scoped read finds nothing
    const { GET } = await import("@/../app/api/console/quotations/[id]/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/q9"), params("q9"));
    expect(res.status).toBe(404);
  });

  it("PATCH verifies the row's REAL owner before writing", async () => {
    // Scoping only the WRITE is not enough: a PATCH filtered by
    // id=eq.X AND client_id=eq.mine against a foreign row updates ZERO rows and
    // PostgREST returns [] with HTTP 200 — the UI would report "Saved" for a
    // write that never happened.
    currentSession = customerA;
    fixtures.quotations = [{ id: "q9", client_id: TENANT_B }]; // owned by B
    const { PATCH } = await import("@/../app/api/console/quotations/[id]/route");
    const res = await PATCH(
      await nextReq(
        "http://x/api/console/quotations/q9",
        jsonInit({ customer_name: "Hijack" }, "PATCH"),
      ),
      params("q9"),
    );
    expect(res.status).toBe(404);
    expect(calls.some((c) => c.op === "patch")).toBe(false);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("DELETE removes child rows WITH a tenant filter, not just a quotation_id", async () => {
    // Defence in depth on the one operation that cannot be undone. The children
    // carry their own client_id, so scoping costs nothing.
    currentSession = customerA;
    fixtures.quotations = [{ id: "q1", client_id: TENANT_A }];
    const { DELETE } = await import("@/../app/api/console/quotations/[id]/route");
    const res = await DELETE(
      await nextReq("http://x/api/console/quotations/q1", { method: "DELETE" }),
      params("q1"),
    );
    expect(res.status).toBe(200);
    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.length).toBe(3); // measured, unmeasured, quotation
    for (const d of deletes) {
      expect(d.qs.client_id, `DELETE ${d.table} had no tenant filter`).toBe("eq." + TENANT_A);
    }
  });

  it("DELETE refuses another tenant's quotation and performs no destructive write", async () => {
    currentSession = customerA;
    fixtures.quotations = [{ id: "q9", client_id: TENANT_B }];
    const { DELETE } = await import("@/../app/api/console/quotations/[id]/route");
    const res = await DELETE(
      await nextReq("http://x/api/console/quotations/q9", { method: "DELETE" }),
      params("q9"),
    );
    expect(res.status).toBe(404);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("PATCH re-stamps children with the ROW's owner, never the caller's tenant", async () => {
    // An admin editing a tenant's quotation must not silently move it to another
    // company. The row's own client_id wins over the session's.
    currentSession = adminSession;
    fixtures.quotations = [{ id: "q1", client_id: TENANT_B }];
    const { PATCH } = await import("@/../app/api/console/quotations/[id]/route");
    await PATCH(
      await nextReq(
        `http://x/api/console/quotations/q1?client_id=${TENANT_A}`,
        jsonInit(
          {
            customer_name: "Ravi",
            measured_items: [{ width: 100, height: 100, units: 1, rate: 10 }],
          },
          "PATCH",
        ),
      ),
      params("q1"),
    );
    const insert = calls.find((c) => c.table === "measured_items" && c.op === "post");
    expect(insert!.body[0].client_id).toBe(TENANT_B); // the row's owner, not ?client_id=
  });

  it("deletes line items BEFORE inserting replacements", async () => {
    // Order is load-bearing. If an insert ran first and the delete then failed,
    // the quotation would carry DOUBLED line items — and a doubled price on a
    // customer-facing document.
    currentSession = customerA;
    fixtures.quotations = [{ id: "q1", client_id: TENANT_A }];
    const { PATCH } = await import("@/../app/api/console/quotations/[id]/route");
    await PATCH(
      await nextReq(
        "http://x/api/console/quotations/q1",
        jsonInit(
          {
            customer_name: "Ravi",
            measured_items: [{ width: 100, height: 100, units: 1, rate: 10 }],
          },
          "PATCH",
        ),
      ),
      params("q1"),
    );
    const delIdx = calls.findIndex((c) => c.op === "delete" && c.table === "measured_items");
    const insIdx = calls.findIndex((c) => c.op === "post" && c.table === "measured_items");
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(insIdx).toBeGreaterThan(delIdx);
  });
});

// ===========================================================================
describe("/api/console/customers and /products", () => {
  it("customers GET filters by tenant AND excludes soft-deleted rows", async () => {
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/customers/route");
    await GET(await nextReq("http://x/api/console/customers"));
    expectAllScopedTo(TENANT_A);
    const page = calls.find((c) => c.table === "customers" && c.qs.select);
    expect(page!.qs.soft_deleted).toBe("eq.false");
  });

  it("customers POST returns the EXISTING row instead of a 409 on a duplicate phone", async () => {
    // Migration 007 has a UNIQUE(client_id, phone) partial index. Alt+C
    // create-on-the-fly makes duplicate phones the NORMAL case (the same repeat
    // customer typed in again), and a raw Postgres constraint error mid-quote is
    // useless to a fabricator.
    currentSession = customerA;
    fixtures.customers = [{ id: "c1", name: "Ravi", phone: "9440874678" }];
    const { POST } = await import("@/../app/api/console/customers/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/customers",
        jsonInit({ name: "Ravi Kumar", phone: "9440874678" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.existing).toBe(true);
    expect(calls.some((c) => c.table === "customers" && c.op === "post")).toBe(false);
  });

  it("customers POST ignores a body-supplied client_id for a customer session", async () => {
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/customers/route");
    const res = await POST(
      await nextReq(
        "http://x/api/console/customers",
        jsonInit({ client_id: TENANT_B, name: "Planted" }),
      ),
    );
    expect(res.status).toBe(403);
    expectNoTraceOf(TENANT_B);
  });

  it("products POST defaults a blank unit to SFT rather than empty text", async () => {
    // Migration 008 defaults unit to 'SFT'; an empty string from a blanked form
    // field would override the default with nothing.
    currentSession = customerA;
    const { POST } = await import("@/../app/api/console/products/route");
    await POST(
      await nextReq(
        "http://x/api/console/products",
        jsonInit({ name: "Sliding Window", price: "450", unit: "" }),
      ),
    );
    const insert = calls.find((c) => c.table === "products" && c.op === "post");
    expect(insert!.body.unit).toBe("SFT");
    expect(insert!.body.client_id).toBe(TENANT_A);
  });

  it("products GET rejects a signup-role session", async () => {
    currentSession = signupSession;
    const { GET } = await import("@/../app/api/console/products/route");
    const res = await GET(await nextReq("http://x/api/console/products"));
    expect(res.status).toBe(403);
    expect(calls.length).toBe(0);
  });
});

// ===========================================================================
describe("/api/console/stats", () => {
  it("aggregates only the session tenant's rows", async () => {
    currentSession = customerA;
    const { GET } = await import("@/../app/api/console/stats/route");
    await GET(await nextReq("http://x/api/console/stats"));
    expectAllScopedTo(TENANT_A);
  });

  it("buckets legacy 'Draft' and modern 'draft' into ONE count", async () => {
    // Two different draft counts on two different screens is precisely the kind
    // of small inconsistency that makes an owner stop trusting the numbers.
    currentSession = customerA;
    fixtures.quotations = [
      { id: "1", status: "Draft", created_at: new Date().toISOString(), measured_items: [], unmeasured_items: [] },
      { id: "2", status: "draft", created_at: new Date().toISOString(), measured_items: [], unmeasured_items: [] },
    ];
    const { GET } = await import("@/../app/api/console/stats/route");
    const res = await GET(await nextReq("http://x/api/console/stats"));
    const body = await res.json();
    expect(body.counts.draft).toBe(2);
    expect(body.counts.Draft).toBeUndefined();
  });

  it("reports net and grand totals that match pricing.ts exactly", async () => {
    currentSession = customerA;
    const row = {
      id: "1",
      status: "won",
      created_at: new Date().toISOString(),
      transport_cost: 2500,
      include_gst: true,
      gst_percentage: 18,
      measured_items: [{ width: 1200, height: 1500, units: 2, rate: 450 }],
      unmeasured_items: [{ units: 3, rate: 1250.75 }],
    };
    fixtures.quotations = [row];
    const { GET } = await import("@/../app/api/console/stats/route");
    const res = await GET(await nextReq("http://x/api/console/stats"));
    const body = await res.json();

    const { quotationTotals } = await import("@/lib/pricing");
    const t = quotationTotals(row, row.measured_items, row.unmeasured_items);
    expect(body.totalNet).toBe(t.netTotal);
    expect(body.totalGrand).toBe(t.grandTotal);
    expect(body.totalGst).toBe(t.gstAmount);
  });

  it("never divides by zero on an empty tenant", async () => {
    currentSession = customerA;
    fixtures.quotations = [];
    const { GET } = await import("@/../app/api/console/stats/route");
    const res = await GET(await nextReq("http://x/api/console/stats"));
    const body = await res.json();
    expect(body.winRate).toBe(0);
    expect(body.avgQuoteValue).toBe(0);
    expect(Number.isNaN(body.winRate)).toBe(false);
  });
});

// ===========================================================================
describe("console-schemas — shared client/server validation", () => {
  it("coerces PostgREST numeric strings without producing NaN", async () => {
    const { quotationWriteSchema } = await import("@/lib/console-schemas");
    const parsed = quotationWriteSchema.parse({
      customer_name: "Ravi",
      transport_cost: "2500",
      gst_percentage: "18",
      include_gst: "true",
      measured_items: [{ width: "1200", height: "1500", units: "2", rate: "450" }],
    });
    expect(parsed.transport_cost).toBe(2500);
    expect(parsed.include_gst).toBe(true);
    expect(parsed.measured_items[0].width).toBe(1200);
  });

  it("treats an emptied field as unset, not as zero", async () => {
    // Number("") is 0. A user who clears the Units box means "not set", and
    // silently pricing the line at zero quantity would be a wrong quotation.
    const { measuredItemSchema } = await import("@/lib/console-schemas");
    const parsed = measuredItemSchema.parse({ units: "", rate: "" });
    expect(parsed.units).toBe(1); // documented default
    expect(parsed.rate).toBe(0);
  });

  it("rejects a GST percentage above 100", async () => {
    const { quotationWriteSchema } = await import("@/lib/console-schemas");
    const res = quotationWriteSchema.safeParse({
      customer_name: "Ravi",
      gst_percentage: 180,
    });
    expect(res.success).toBe(false);
  });

  it("caps line items so one request cannot exhaust the function timeout", async () => {
    const { quotationWriteSchema, MAX_MEASURED_ITEMS } = await import("@/lib/console-schemas");
    const res = quotationWriteSchema.safeParse({
      customer_name: "Ravi",
      measured_items: Array.from({ length: MAX_MEASURED_ITEMS + 1 }, () => ({
        width: 100,
        height: 100,
        units: 1,
        rate: 10,
      })),
    });
    expect(res.success).toBe(false);
  });

  it("normalises legacy capitalised statuses", async () => {
    const { quotationStatusSchema } = await import("@/lib/console-schemas");
    expect(quotationStatusSchema.parse("Draft")).toBe("draft");
    expect(quotationStatusSchema.parse(" SENT ")).toBe("sent");
  });

  it("does NOT accept client_id in any write schema", async () => {
    // The tenant is not input. If a schema accepted it, a valid-looking payload
    // could re-target another tenant and the API would have no way to tell.
    const { quotationWriteSchema, customerWriteSchema, productWriteSchema } = await import(
      "@/lib/console-schemas"
    );
    for (const [name, schema] of [
      ["quotation", quotationWriteSchema],
      ["customer", customerWriteSchema],
      ["product", productWriteSchema],
    ] as const) {
      const parsed: any = schema.parse({ customer_name: "R", name: "R", client_id: TENANT_B });
      expect(parsed.client_id, `${name} schema leaked client_id through`).toBeUndefined();
    }
  });

  it("drops an unknown sort column back to the default", async () => {
    const { quotationQuerySchema } = await import("@/lib/console-schemas");
    const parsed = quotationQuerySchema.parse({ sort: "; DROP TABLE quotations" });
    expect(parsed.sort).toBe("created_at");
  });

  it("clamps page_size to the documented ceiling", async () => {
    const { quotationQuerySchema, MAX_PAGE_SIZE } = await import("@/lib/console-schemas");
    const parsed = quotationQuerySchema.parse({ page_size: 100000 });
    expect(parsed.page_size).toBe(MAX_PAGE_SIZE);
  });
});

// ===========================================================================
describe("CSV export safety", () => {
  it("neutralises formula injection so an export cannot execute in Excel", async () => {
    // A customer named "=cmd|'/c calc'!A1" becomes code execution on the
    // accountant's machine when they open the file. Scribe's data-portability
    // promise only holds if the exports are safe to open.
    const { csvCell } = await import("@/lib/console-format");
    expect(csvCell("=cmd|'/c calc'!A1").startsWith("'")).toBe(true);
    expect(csvCell("+1234").startsWith("'")).toBe(true);
    expect(csvCell("@SUM(A1)").startsWith("'")).toBe(true);
    expect(csvCell("-2+3")).toBe("'-2+3");
  });

  it("quotes and doubles embedded quotes per RFC 4180", async () => {
    const { csvCell } = await import("@/lib/console-format");
    expect(csvCell('He said "hi", loudly')).toBe('"He said ""hi"", loudly"');
  });

  it("emits a BOM so Excel reads Indian names as UTF-8", async () => {
    const { toCsv } = await import("@/lib/console-format");
    expect(toCsv(["A"], [["ಠ"]]).startsWith("\ufeff")).toBe(true);
  });
});

// ===========================================================================
describe("money formatting parity with the PDF", () => {
  it('prints "Rs." and never the U+20B9 rupee glyph', async () => {
    // pdf-lib cannot encode U+20B9 with the WinAnsi standard fonts and THROWS,
    // so every generated PDF says "Rs.". The console preview claims to show what
    // the customer will receive; a different currency mark makes that a lie.
    const { formatMoney, formatMoneyCompact } = await import("@/lib/console-format");
    expect(formatMoney(1234.5)).toContain("Rs.");
    expect(formatMoney(1234.5)).not.toContain("\u20B9");
    expect(formatMoneyCompact(1234.5)).not.toContain("\u20B9");
  });

  it("groups digits the Indian way (lakhs), not in thousands", async () => {
    const { formatAmount } = await import("@/lib/console-format");
    expect(formatAmount(1234567.89)).toBe("12,34,567.89");
  });

  it("renders a corrupt value as 0.00 rather than NaN", async () => {
    // One NaN would otherwise poison a whole screen with "Rs. NaN".
    const { formatAmount, formatSqft } = await import("@/lib/console-format");
    expect(formatAmount("not-a-number")).toBe("0.00");
    expect(formatSqft(undefined)).toBe("0.00");
  });

  it("formats dates as DD-MM-YYYY, never MM-DD-YYYY", async () => {
    const { formatDate } = await import("@/lib/console-format");
    expect(formatDate("2026-08-05")).toBe("05-08-2026");
  });
});
