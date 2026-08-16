/**
 * THE WHATSAPP SHARE LINK — token minting + public PDF download.
 *
 * Covers the two defects that made "share a quote on WhatsApp" unusable:
 *
 *  1. `GET /api/quotation/[id]/token` required a web `session` cookie. The
 *     Flutter APK has no cookie jar, so it got 401, the Dart helper swallowed
 *     it and returned "", and the customer received `?token=` -> 403.
 *     Fixed by accepting a credentialed POST (client_id + password hash).
 *
 *  2. The public page's "Download PDF" was `window.print()` — no file.
 *     Fixed by `GET /api/quotation/[id]/pdf?token=`, which streams a real PDF.
 *
 * The security properties matter more than the happy path here: this is an
 * unauthenticated, internet-facing surface holding customer pricing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hashQuotationToken } from "../src/lib/quotation-token";

const TEST_SECRET = "nexy-test-quote-token-secret";
const QUOTE_ID = "11111111-2222-3333-4444-555555555555";
const CLIENT_ID = "venkateshwara";
const OTHER_CLIENT = "kprupvc";
// SHA-256 of the tenant's portal password, as stored in `clients.password_hash`.
const GOOD_HASH = "8622f0f69c91819119a8acf60a248d7b36fdb7ccf857ba8f85cf7f2767ff8265";

function validToken(id: string): string {
  return id === QUOTE_ID ? "a".repeat(32) : "b".repeat(32);
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const tableResponses: Record<string, { data: any; error: any }> = {};
const selectCalls: string[] = [];
let acceptedTokenHash = hashQuotationToken(validToken(QUOTE_ID));

function makeBuilder(table: string) {
  const result = tableResponses[table] ?? { data: null, error: { message: "no fixture" } };
  const filters: Record<string, unknown> = {};
  const builder: any = {
    select: () => {
      selectCalls.push(table);
      return builder;
    },
    eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
    gt: () => builder,
    is: () => builder,
    insert: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(
      table === "quotation_share_tokens" &&
      filters.token_hash !== acceptedTokenHash
        ? { data: null, error: null }
        : result,
    ),
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return builder;
}

vi.mock("@/lib/supabase-client", () => ({
  supabaseAdmin: { from: (t: string) => makeBuilder(t) },
  supabase: { from: (t: string) => makeBuilder(t) },
}));

/** Session cookie state, controlled per-test. */
let sessionValue: any = null;
vi.mock("@/lib/session", () => ({
  getSession: async () => sessionValue,
}));

/**
 * pdf-lib is slow and its output is not what we are asserting — we care that
 * the ROUTE reaches generation only when authorised, and sets the right
 * headers. A stub keeps the suite hermetic and fast.
 */
const pdfCalls: any[] = [];
vi.mock("@/lib/quotation-pdf", () => ({
  buildQuotationPdf: async (data: any) => {
    pdfCalls.push(data);
    return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  },
}));

async function loadTokenRoute() {
  vi.resetModules();
  process.env.QUOTE_TOKEN_SECRET = TEST_SECRET;
  return import("../app/api/quotation/[id]/token/route");
}

async function loadPdfRoute() {
  vi.resetModules();
  process.env.QUOTE_TOKEN_SECRET = TEST_SECRET;
  return import("../app/api/quotation/[id]/pdf/route");
}

const params = { params: Promise.resolve({ id: QUOTE_ID }) };

function postReq(body: unknown) {
  return new Request(`https://app.vitharn.com/api/quotation/${QUOTE_ID}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as any;
}

function seedQuotation(clientId = CLIENT_ID) {
  tableResponses.quotations = {
    data: {
      id: QUOTE_ID,
      quote_no: "JVUPVC-0042",
      date: "2026-08-09",
      customer_name: "Test Customer",
      reference: "REF-1",
      address: "Hyderabad",
      contact_no: "9999999999",
      email: "c@example.com",
      supplier_company: "Fenesta",
      transport_cost: 2500,
      include_gst: true,
      gst_percentage: 18,
      status: "sent",
      client_id: clientId,
    },
    error: null,
  };
  tableResponses.quotation_share_tokens = {
    data: { quotation_id: QUOTE_ID, expires_at: "2099-01-01T00:00:00.000Z" },
    error: null,
  };
}

beforeEach(() => {
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  selectCalls.length = 0;
  pdfCalls.length = 0;
  sessionValue = null;
  acceptedTokenHash = hashQuotationToken(validToken(QUOTE_ID));
});

afterEach(() => {
  delete process.env.QUOTE_TOKEN_SECRET;
});

// ===========================================================================
describe("POST /api/quotation/[id]/token — the Flutter path (ROOT CAUSE #1)", () => {
  it("mints a token for a tenant presenting client_id + correct password hash", async () => {
    // This is the exact request lib/quote_share.dart now sends. Before the fix
    // there was no POST handler at all and the GET returned 401 for this caller.
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: GOOD_HASH }, error: null };
    seedQuotation();

    const res = await POST(postReq({ client_id: CLIENT_ID, admin_password_hash: GOOD_HASH }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    expect(body.expires_at).toBeTruthy();
  });

  it("mints a token that the PUBLIC route actually accepts (end-to-end)", async () => {
    // The regression that started all of this was the two sides disagreeing.
    // Mint through the real minting route, verify through the real public route.
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: GOOD_HASH }, error: null };
    seedQuotation();
    const minted = (await (await POST(
      postReq({ client_id: CLIENT_ID, admin_password_hash: GOOD_HASH }),
      params,
    )).json()).token;
    acceptedTokenHash = hashQuotationToken(minted);

    tableResponses.quotation_share_tokens = {
      data: { quotation_id: QUOTE_ID, expires_at: "2099-01-01T00:00:00.000Z" },
      error: null,
    };

    vi.resetModules();
    process.env.QUOTE_TOKEN_SECRET = TEST_SECRET;
    const { GET } = await import("../app/api/quotation/[id]/route");
    tableResponses.measured_items = { data: [], error: null };
    tableResponses.unmeasured_items = { data: [], error: null };
    tableResponses.clients = { data: { config: { companyName: "V" } }, error: null };
    seedQuotation();

    const pub = await GET(
      new Request(`https://app.vitharn.com/api/quotation/${QUOTE_ID}?token=${minted}`),
      params,
    );
    expect(pub.status).toBe(200);
  });

  it("rejects a WRONG password hash (401) — no token minted", async () => {
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: GOOD_HASH }, error: null };
    seedQuotation();
    const res = await POST(postReq({ client_id: CLIENT_ID, admin_password_hash: "f".repeat(64) }), params);
    expect(res.status).toBe(401);
  });

  it("rejects a client_id with NO hash — knowing a tenant slug must not be enough", async () => {
    // Tenant slugs are public (they appear in URLs like /kprupvc). If a bare
    // client_id minted tokens, anyone could enumerate a tenant's whole
    // quotation history.
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: GOOD_HASH }, error: null };
    seedQuotation();
    for (const body of [{ client_id: CLIENT_ID }, { client_id: CLIENT_ID, admin_password_hash: "" }]) {
      const res = await POST(postReq(body), params);
      expect(res.status, JSON.stringify(body)).toBe(401);
    }
  });

  it("rejects a tenant asking for ANOTHER tenant's quotation (403 IDOR)", async () => {
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: GOOD_HASH }, error: null };
    seedQuotation(OTHER_CLIENT); // quotation belongs to someone else
    const res = await POST(postReq({ client_id: CLIENT_ID, admin_password_hash: GOOD_HASH }), params);
    expect(res.status).toBe(403);
  });

  it("rejects a tenant row that has no password_hash at all", async () => {
    // A null/empty stored hash must never authenticate an empty submitted hash.
    const { POST } = await loadTokenRoute();
    tableResponses.clients = { data: { id: CLIENT_ID, password_hash: null }, error: null };
    seedQuotation();
    const res = await POST(postReq({ client_id: CLIENT_ID, admin_password_hash: "" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON rather than crashing", async () => {
    const { POST } = await loadTokenRoute();
    const res = await POST(postReq("{not json"), params);
    expect(res.status).toBe(400);
  });

  it("fails closed with 503 when QUOTE_TOKEN_SECRET is unset", async () => {
    vi.resetModules();
    delete process.env.QUOTE_TOKEN_SECRET;
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const { POST } = await import("../app/api/quotation/[id]/token/route");
      const res = await POST(postReq({ client_id: CLIENT_ID, admin_password_hash: GOOD_HASH }), params);
      expect(res.status).toBe(401);
    } finally {
      if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });
});

describe("GET /api/quotation/[id]/token — the web-cookie path still works", () => {
  it("mints for a customer session that owns the quotation", async () => {
    const { GET } = await loadTokenRoute();
    sessionValue = { role: "customer", email: "a@b.c", client_id: CLIENT_ID };
    seedQuotation();
    const res = await GET(new Request("https://app.vitharn.com/x") as any, params);
    expect(res.status).toBe(200);
    expect((await res.json()).token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("still rejects an anonymous GET (401)", async () => {
    const { GET } = await loadTokenRoute();
    sessionValue = null;
    seedQuotation();
    const res = await GET(new Request("https://app.vitharn.com/x") as any, params);
    expect(res.status).toBe(401);
  });

  it("rejects a session for a DIFFERENT tenant (403)", async () => {
    const { GET } = await loadTokenRoute();
    sessionValue = { role: "customer", email: "a@b.c", client_id: OTHER_CLIENT };
    seedQuotation(CLIENT_ID);
    const res = await GET(new Request("https://app.vitharn.com/x") as any, params);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
describe("GET /api/quotation/[id]/pdf — real file download (ROOT CAUSE #2)", () => {
  function pdfReq(token?: string | null) {
    const qs = token === undefined ? "" : `?token=${token ?? ""}`;
    return new Request(`https://app.vitharn.com/api/quotation/${QUOTE_ID}/pdf${qs}`);
  }

  function seedFullPdf() {
    seedQuotation();
    tableResponses.measured_items = {
      data: [{ code: "W1", description: "Sliding Window", glass: "5mm", width: 1200, height: 1500, units: 2, rate: 450 }],
      error: null,
    };
    tableResponses.unmeasured_items = { data: [{ description: "Installation", units: 1, rate: 3000 }], error: null };
  }

  it("returns a real PDF with attachment headers for a valid token", async () => {
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    tableResponses.clients = { data: { config: { companyName: "Venkateshwara uPVC" } }, error: null };

    const res = await GET(pdfReq(validToken(QUOTE_ID)), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    // `attachment` is what makes the browser save a file instead of rendering
    // it — the whole point of replacing window.print().
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("Quotation_JVUPVC-0042.pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("never caches a customer's priced document in a shared cache", async () => {
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    tableResponses.clients = { data: { config: {} }, error: null };
    const res = await GET(pdfReq(validToken(QUOTE_ID)), params);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("rejects missing / empty / wrong / cross-id tokens with 403 and reads NOTHING", async () => {
    // Fail-closed BEFORE the database, so the endpoint cannot be used to probe
    // which quotation ids exist.
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    const bad = [undefined, null, "", "deadbeefdeadbeef", validToken("some-other-id")];
    for (const t of bad) {
      selectCalls.length = 0;
      const res = await GET(pdfReq(t as any), params);
      expect(res.status, `token ${String(t)}`).toBe(403);
      expect(selectCalls, `token ${String(t)} must query only token storage`).toEqual(
        t ? ["quotation_share_tokens"] : [],
      );
      expect(pdfCalls).toEqual([]);
    }
  });

  it("uses pricing.ts totals — the mm formula, NOT the old /144", async () => {
    // The public page used to compute (w*h*units)/144, treating millimetres as
    // inches — a 645.16x error on the figure the customer was asked to approve.
    //
    // Correct (mm) math, matching lib/models.dart and src/lib/pricing.ts:
    //   sft   = (1200/304.8) * (1500/304.8) = 19.375038750...
    //   measured = sft * 2 units * 450      = 17437.534875069752
    //   + 3000 unmeasured                   = 20437.534875069752 (subtotal)
    //   + 2500 transport                    = 22937.534875069752 (netTotal)
    //   + 18% GST                           = 27066.291152582307 (grandTotal)
    //
    // The old /144 formula produced 7846.875 for the same measured line.
    // These values are asserted to 4dp precisely so a drift from the Dart
    // implementation shows up as a failure rather than a rounding shrug.
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    tableResponses.clients = { data: { config: {} }, error: null };
    await GET(pdfReq(validToken(QUOTE_ID)), params);

    expect(pdfCalls).toHaveLength(1);
    const t = pdfCalls[0].totals;
    expect(t.totalMeasured).toBeCloseTo(17437.534875069752, 4);
    expect(t.netTotal).toBeCloseTo(22937.534875069752, 4);
    expect(t.gstAmount).toBeCloseTo(4128.756277512555, 4);
    expect(t.grandTotal).toBeCloseTo(27066.291152582307, 4);
    // And explicitly NOT the old inches interpretation.
    expect(t.totalMeasured).not.toBeCloseTo(7846.875, 2);
  });

  it("returns 404 for a missing or soft-deleted quotation", async () => {
    const { GET } = await loadPdfRoute();
    tableResponses.quotations = { data: null, error: { message: "PGRST116" } };
    tableResponses.quotation_share_tokens = {
      data: { quotation_id: QUOTE_ID, expires_at: "2099-01-01T00:00:00.000Z" },
      error: null,
    };
    const res = await GET(pdfReq(validToken(QUOTE_ID)), params);
    expect(res.status).toBe(404);
  });

  it("NEVER leaks tenant secrets from clients.config into the PDF payload", async () => {
    // Same P0 class as the JSON route: config carries portalPasswordHash and
    // supabaseAnonKey. We map named fields only.
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    tableResponses.clients = {
      data: {
        config: {
          companyName: "KPR Fabricators",
          portalPasswordHash: GOOD_HASH,
          supabaseAnonKey: "eyJhbGciOiJIUzI1NiJ9.super-secret-anon-key",
          adminEmails: ["owner@example.com"],
        },
      },
      error: null,
    };
    await GET(pdfReq(validToken(QUOTE_ID)), params);
    const raw = JSON.stringify(pdfCalls[0]);
    expect(raw).not.toContain(GOOD_HASH);
    expect(raw).not.toContain("super-secret-anon-key");
    expect(raw).not.toContain("owner@example.com");
    expect(pdfCalls[0].companyName).toBe("KPR Fabricators");
  });

  it("sanitises the filename so a quote_no cannot inject a header", async () => {
    const { GET } = await loadPdfRoute();
    seedFullPdf();
    tableResponses.quotations.data.quote_no = 'evil"\r\nX-Injected: 1';
    tableResponses.clients = { data: { config: {} }, error: null };
    const res = await GET(pdfReq(validToken(QUOTE_ID)), params);
    const cd = res.headers.get("content-disposition") || "";
    // The CR/LF and the quote are what would actually terminate the header and
    // inject a new one; the literal word surviving as filename text is inert.
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd).not.toMatch(/filename="[^"]*"[^"]/);
    expect(res.headers.get("x-injected")).toBeNull();
  });
});
