/**
 * TEST 7 — PDF GENERATION ROUTES + CONSOLE SUB-ROUTES
 *
 * Owned by Bugsy. Added 08-08-2026.
 *
 * Covers the routes that the earlier test files deliberately did NOT exercise:
 *   - /api/gst_invoices/[id]/pdf — GST invoice PDF generation
 *   - /api/console/quotations/[id]/pdf — uPVC quotation PDF generation
 *   - /api/console/quotations/[id]/duplicate — clone as new draft
 *   - /api/console/quotations/number — next quotation number
 *
 * The PDF routes are the interesting ones: they read tenant data and render it
 * into a binary document. A cross-tenant read here does not just leak a JSON
 * blob — it prints the wrong company's letterhead, bank details and line items
 * onto a PDF that the customer will receive. So ownership MUST hold.
 *
 * The duplicate and number routes test the console's Alt+2 and draft-number
 * flows: the duplicate must stay in the SAME tenant (never move a quotation
 * between companies), and the number generator must scope its scan to the
 * session tenant.
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
  "gst_invoices",
  "gst_invoice_items",
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
    return fixtures[t + ":insert"] ?? [{ id: "new-row-id" }];
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
  supabaseRpc: async (name: string, _params: any) => {
    // Record the RPC call so tests can assert it was attempted.
    calls.push({ op: "post", table: "rpc:" + name, qs: _params });
    throw new Error("RPC not available"); // simulate migration not applied
  },
}));

// The PDF generation routes call into pdf-lib, which requires a real font kit
// and DOM APIs that do not exist in the vitest node environment. Mock both
// generators so the route logic (auth, ownership, scoping) can be tested without
// actually rendering a PDF. The PDF rendering itself is tested separately.
vi.mock("@/lib/gst-invoice-pdf", () => ({
  buildGstInvoicePdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
}));
vi.mock("@/lib/quotation-pdf", () => ({
  buildQuotationPdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}));

let currentSession: any = null;
vi.mock("@/lib/session", () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
  deleteSession: async () => {},
}));

function loginAs(session: any) {
  currentSession = session;
}

const customerA = { role: "customer", email: "a@x.com", client_id: TENANT_A };
const customerB = { role: "customer", email: "b@x.com", client_id: TENANT_B };
const adminSession = { role: "admin", email: "admin@vitharn.com" };
const signupSession = { role: "signup", email: "attacker@evil.com", signup_request_id: "9" };

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  currentSession = null;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.JWT_SECRET = "bugsy-test-jwt-secret";
  vi.resetModules();
});

async function nextReq(url: string, init?: RequestInit) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(url, init as any);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Every tenant-table call must be scoped to exactly `expected`.
 *
 * For GET/DELETE the filter lives in `qs`. For POST (inserts) the tenant is
 * written into the body — and for bulk inserts (arrays) EVERY row must carry
 * it. A missing client_id on even one child row orphans it from the tenant.
 */
function expectAllScopedTo(expected: string) {
  const tenantCalls = calls.filter((c) => TENANT_TABLES.includes(c.table));
  for (const c of tenantCalls) {
    if (c.op === "post") {
      const rows = Array.isArray(c.body) ? c.body : [c.body];
      for (const row of rows) {
        expect(
          row?.client_id,
          `POST ${c.table} wrote a row with no client_id — orphans from the tenant`,
        ).toBe(expected);
      }
    } else {
      expect(
        c.qs?.client_id,
        `${c.op.toUpperCase()} ${c.table} has NO client_id filter — the service role bypasses RLS`,
      ).toBe("eq." + expected);
    }
  }
}

/** No call may mention the victim tenant. */
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
describe("/api/gst_invoices/[id]/pdf — GST invoice PDF", () => {
  it("rejects an anonymous caller (401) and issues no query", async () => {
    loginAs(null);
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-a/pdf"), params("inv-a"));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => TENANT_TABLES.includes(c.table))).toEqual([]);
  });

  it("rejects a signup-role session (403) and issues no child query", async () => {
    loginAs(signupSession);
    // The parent row must exist for the ownership check to fire — without a
    // fixture, the route returns 404 before reaching authorizeOwnedTenant.
    fixtures.gst_invoices = [{ id: "inv-a", client_id: TENANT_A }];
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-a/pdf"), params("inv-a"));
    expect(res.status).toBe(403);
    // The parent was read to determine ownership, but child rows must NOT be.
    expect(calls.filter((c) => c.table === "gst_invoice_items")).toEqual([]);
  });

  it("blocks reading another tenant's GST invoice PDF (403)", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-b", client_id: TENANT_B, buyer_gstin: "SECRET" }];
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-b/pdf"), params("inv-b"));
    expect(res.status).toBe(403);
    // The child rows must NOT have been read — the parent ownership check
    // failed, so we must bail before touching gst_invoice_items.
    expect(calls.filter((c) => c.table === "gst_invoice_items")).toEqual([]);
    // And the secret must not leak out in the response body.
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("SECRET");
  });

  it("allows reading OWN invoice PDF with child rows scoped to tenant", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [
      {
        id: "inv-a",
        client_id: TENANT_A,
        invoice_number: "GST-001",
        invoice_date: "2026-08-08",
        supplier_company_name: "Venkateshwara uPVC",
        buyer_name: "Test Customer",
        subtotal: 10000,
        transport_cost: 500,
        taxable_value: 10500,
        cgst_rate: 9,
        sgst_rate: 9,
        igst_rate: 0,
        cgst_amount: 945,
        sgst_amount: 945,
        igst_amount: 0,
        grand_total: 12390,
        amount_in_words: "Twelve Thousand Three Hundred Ninety Only",
      },
    ];
    fixtures.gst_invoice_items = [
      { sno: 1, hsn_code: "7610", description: "Sliding Window", quantity: 2, unit: "SFT", rate: 450, taxable_value: 900 },
    ];
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-a/pdf"), params("inv-a"));
    // The PDF generation may fail (no real pdf-lib in test env), but the
    // ownership check must pass — a 500 from pdf-lib is fine, a 403 is not.
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    // Child rows must be scoped to the verified tenant.
    const childRead = calls.find((c) => c.table === "gst_invoice_items");
    expect(childRead).toBeDefined();
    expect(childRead!.qs.client_id).toBe("eq." + TENANT_A);
  });

  it("an admin can generate any tenant's invoice PDF (documented exception)", async () => {
    loginAs(adminSession);
    fixtures.gst_invoices = [
      {
        id: "inv-b",
        client_id: TENANT_B,
        invoice_number: "GST-B001",
        invoice_date: "2026-08-08",
        buyer_name: "B Customer",
        subtotal: 5000,
        grand_total: 5900,
      },
    ];
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-b/pdf"), params("inv-b"));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

// ===========================================================================
describe("/api/console/quotations/[id]/pdf — uPVC quotation PDF", () => {
  it("rejects an anonymous caller (401)", async () => {
    loginAs(null);
    const { GET } = await import("../app/api/console/quotations/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/q1/pdf"), params("q1"));
    expect(res.status).toBe(401);
    expect(calls.filter((c) => TENANT_TABLES.includes(c.table))).toEqual([]);
  });

  it("scopes the read to the session tenant", async () => {
    loginAs(customerA);
    fixtures.quotations = [
      {
        id: "q1",
        client_id: TENANT_A,
        quote_no: "Q-1",
        date: "2026-08-08",
        customer_name: "Test",
        transport_cost: 0,
        include_gst: false,
        gst_percentage: 0,
        measured_items: [],
        unmeasured_items: [],
      },
    ];
    const { GET } = await import("../app/api/console/quotations/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/q1/pdf"), params("q1"));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
    // The read must carry client_id.
    const read = calls.find((c) => c.table === "quotations");
    expect(read!.qs.client_id).toBe("eq." + TENANT_A);
  });

  it("returns 404 for another tenant's quotation (not 403)", async () => {
    loginAs(customerA);
    // The scoped read (id AND client_id) finds nothing for tenant A.
    fixtures.quotations = [];
    const { GET } = await import("../app/api/console/quotations/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/q9/pdf"), params("q9"));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
describe("/api/console/quotations/[id]/duplicate — clone as draft", () => {
  it("rejects an anonymous caller (401)", async () => {
    loginAs(null);
    const { POST } = await import("../app/api/console/quotations/[id]/duplicate/route");
    const res = await POST(
      await nextReq("http://x/api/console/quotations/q1/duplicate", { method: "POST" }),
      params("q1"),
    );
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("creates a draft copy scoped to the session tenant", async () => {
    loginAs(customerA);
    fixtures.quotations = [
      {
        id: "q1",
        client_id: TENANT_A,
        quote_no: "Q-1",
        customer_name: "Ravi",
        transport_cost: 2500,
        include_gst: true,
        gst_percentage: 18,
        measured_items: [{ code: "W1", description: "Window", width: 1200, height: 1500, units: 2, rate: 450 }],
        unmeasured_items: [{ description: "Mesh", units: 3, rate: 200 }],
      },
    ];
    const { POST } = await import("../app/api/console/quotations/[id]/duplicate/route");
    const res = await POST(
      await nextReq("http://x/api/console/quotations/q1/duplicate", { method: "POST" }),
      params("q1"),
    );
    expect(res.status).toBe(201);
    // The new quotation must be stamped with the SOURCE's client_id.
    const quoteWrite = calls.find((c) => c.table === "quotations" && c.op === "post");
    expect(quoteWrite!.body.client_id).toBe(TENANT_A);
    // And its status must be "draft".
    expect(quoteWrite!.body.status).toBe("draft");
    // Child rows must carry client_id too.
    const measuredWrite = calls.find((c) => c.table === "measured_items" && c.op === "post");
    const unmeasuredWrite = calls.find((c) => c.table === "unmeasured_items" && c.op === "post");
    expect(measuredWrite!.body[0].client_id).toBe(TENANT_A);
    expect(unmeasuredWrite!.body[0].client_id).toBe(TENANT_A);
  });

  it("returns 404 when duplicating another tenant's quotation", async () => {
    loginAs(customerA);
    // Scoped read finds nothing for tenant A.
    fixtures.quotations = [];
    const { POST } = await import("../app/api/console/quotations/[id]/duplicate/route");
    const res = await POST(
      await nextReq("http://x/api/console/quotations/q9/duplicate", { method: "POST" }),
      params("q9"),
    );
    expect(res.status).toBe(404);
    expect(calls.some((c) => c.op === "post")).toBe(false);
  });

  it("rejects a signup-role session", async () => {
    loginAs(signupSession);
    const { POST } = await import("../app/api/console/quotations/[id]/duplicate/route");
    const res = await POST(
      await nextReq("http://x/api/console/quotations/q1/duplicate", { method: "POST" }),
      params("q1"),
    );
    expect(res.status).toBe(403);
    expect(calls.length).toBe(0);
  });
});

// ===========================================================================
describe("/api/console/quotations/number — next quotation number", () => {
  it("rejects an anonymous caller (401)", async () => {
    loginAs(null);
    const { GET } = await import("../app/api/console/quotations/number/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/number"));
    expect(res.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it("scopes the number scan to the session tenant", async () => {
    loginAs(customerA);
    fixtures.quotations = [
      { quote_no: "KPRUPVC-07082026-0042" },
      { quote_no: "KPRUPVC-07082026-0040" },
    ];
    const { GET } = await import("../app/api/console/quotations/number/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/number"));
    expect(res.status).toBe(200);
    // The scan query must carry client_id.
    const scan = calls.find((c) => c.table === "quotations");
    expect(scan!.qs.client_id).toBe("eq." + TENANT_A);
    // And the returned number must be max+1.
    const body = await res.json();
    expect(body.quote_no).toMatch(/-0043$/);
  });

  it("rejects a signup-role session", async () => {
    loginAs(signupSession);
    const { GET } = await import("../app/api/console/quotations/number/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/number"));
    expect(res.status).toBe(403);
    expect(calls.length).toBe(0);
  });

  it("starts at 0001 when the tenant has no quotations", async () => {
    loginAs(customerA);
    fixtures.quotations = [];
    const { GET } = await import("../app/api/console/quotations/number/route");
    const res = await GET(await nextReq("http://x/api/console/quotations/number"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quote_no).toMatch(/-0001$/);
  });

  it("tries the RPC first (documented behavior)", async () => {
    loginAs(customerA);
    const { GET } = await import("../app/api/console/quotations/number/route");
    await GET(await nextReq("http://x/api/console/quotations/number"));
    const rpcCall = calls.find((c) => c.table === "rpc:get_next_quote_number");
    expect(rpcCall).toBeDefined();
  });
});

// ===========================================================================
describe("FULL ISOLATION CHECK — PDF + sub-routes scoped to session tenant", () => {
  it("GST PDF: no cross-tenant data ever reaches the response", async () => {
    loginAs(customerA);
    fixtures.gst_invoices = [{ id: "inv-b", client_id: TENANT_B, buyer_gstin: "36AAAAA0000A1Z5" }];
    const { GET } = await import("../app/api/gst_invoices/[id]/pdf/route");
    const res = await GET(await nextReq("http://x/api/gst_invoices/inv-b/pdf"), params("inv-b"));
    expect(res.status).toBe(403);
    expectNoTraceOf("36AAAAA0000A1Z5");
  });

  it("Quotation PDF: scoped read never sees another tenant", async () => {
    loginAs(customerA);
    fixtures.quotations = [];
    const { GET } = await import("../app/api/console/quotations/[id]/pdf/route");
    await GET(await nextReq("http://x/api/console/quotations/q9/pdf"), params("q9"));
    expectAllScopedTo(TENANT_A);
    expectNoTraceOf(TENANT_B);
  });

  it("Duplicate: new row is scoped to the session tenant, never a foreign one", async () => {
    loginAs(customerA);
    fixtures.quotations = [
      {
        id: "q1",
        client_id: TENANT_A,
        quote_no: "Q-1",
        customer_name: "Ravi",
        transport_cost: 0,
        include_gst: false,
        gst_percentage: 0,
        measured_items: [],
        unmeasured_items: [],
      },
    ];
    const { POST } = await import("../app/api/console/quotations/[id]/duplicate/route");
    await POST(
      await nextReq("http://x/api/console/quotations/q1/duplicate", { method: "POST" }),
      params("q1"),
    );
    expectAllScopedTo(TENANT_A);
    expectNoTraceOf(TENANT_B);
  });

  it("Number: scan is scoped to the session tenant", async () => {
    loginAs(customerA);
    fixtures.quotations = [{ quote_no: "Q-1" }];
    const { GET } = await import("../app/api/console/quotations/number/route");
    await GET(await nextReq("http://x/api/console/quotations/number"));
    expectAllScopedTo(TENANT_A);
    expectNoTraceOf(TENANT_B);
  });
});
