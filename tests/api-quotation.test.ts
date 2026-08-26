/**
 * TEST 2 — API RESPONSE CONTRACT (app/api/quotation/[id]/route.ts)
 *
 * This is the public, UNAUTHENTICATED endpoint. A customer clicks a link in an
 * email and lands on `/quote/<id>?token=<hmac>` with no session and no cookie.
 * The ONLY thing standing between a stranger and another company's quotation is
 * a 16-hex-character truncated HMAC. So this route gets tested harder than the
 * ones behind a login.
 *
 * What is asserted:
 *   - status codes for every rejection path (403 / 404 / 400)
 *   - the exact response BODY SHAPE the Flutter/Next client destructures
 *   - that a missing/wrong/tampered token can never reach the database
 *   - that null item arrays are normalised to [] (a null here crashes `.map()`)
 *   - that the state-machine only accepts the three whitelisted actions
 *
 * Supabase is mocked. This suite is hermetic: no network, no live DB, safe to
 * run in CI on every push.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac, createHash } from "crypto";

const TEST_SECRET = "bugsy-test-quote-token-secret";
const QUOTE_ID = "11111111-2222-3333-4444-555555555555";

/** Mirror of the route's own token derivation, so we can forge a VALID token. */
function validToken(id: string, secret = TEST_SECRET): string {
  return createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
}

/** Hash a token the same way the route does (SHA-256). */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
// A hand-rolled chainable stub of the supabase-js query builder. We drive it
// from `tableResponses` so each test declares exactly what the DB "contains".
// `selectCalls` records every table touched, which lets us prove that an
// unauthorised request performs ZERO database reads — not just that it returns
// 403 after leaking a row.
const tableResponses: Record<string, { data: any; error: any }> = {};
const selectCalls: string[] = [];
const updateCalls: Array<{ table: string; payload: any }> = [];

// Track query parameters for token validation
let currentQueryParams: Record<string, any> = {};

function makeBuilder(table: string) {
  const result = tableResponses[table] ?? {
    data: null,
    error: { message: "no fixture" },
  };
  const builder: any = {
    select: () => {
      selectCalls.push(table);
      currentQueryParams = {}; // Reset on new select
      return builder;
    },
    update: (payload: any) => {
      updateCalls.push({ table, payload });
      return builder;
    },
    eq: (column: string, value: any) => {
      currentQueryParams[column] = value;
      return builder;
    },
    gt: (column: string, value: any) => {
      currentQueryParams[column + "_gt"] = value;
      return builder;
    },
    is: (column: string, value: any) => {
      currentQueryParams[column + "_is"] = value;
      return builder;
    },
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    maybeSingle: () => {
      // For quotation_share_tokens, validate the token hash
      if (table === "quotation_share_tokens") {
        const expectedHash = currentQueryParams.token_hash;

        // The fixture stores the correct token_hash and expires_at for the valid token
        const storedHash = result.data?.token_hash;
        const storedExpiresAt = result.data?.expires_at;
        const storedRevokedAt = result.data?.revoked_at;

        // Check if token is valid (not expired, not revoked)
        const now = new Date().toISOString();
        const isExpired = storedExpiresAt && storedExpiresAt <= now;
        const isRevoked =
          storedRevokedAt !== null && storedRevokedAt !== undefined;

        if (
          expectedHash &&
          storedHash &&
          expectedHash === storedHash &&
          !isExpired &&
          !isRevoked
        ) {
          // Valid token - return the fixture data
          return Promise.resolve({
            data: { quotation_id: QUOTE_ID },
            error: null,
          });
        } else {
          // Invalid/expired/revoked token
          return Promise.resolve({ data: null, error: null });
        }
      }
      return Promise.resolve(result);
    },
    // `await builder` (no .single()/.order()) must also resolve.
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase-client", () => {
  const supabase = { from: (table: string) => makeBuilder(table) };
  const supabaseAdmin = { from: (table: string) => makeBuilder(table) };
  return {
    supabase,
    supabaseAdmin,
    getSupabase: () => supabase,
    getSupabaseAdmin: () => supabaseAdmin,
  };
});

/** Import the route AFTER env + mocks are in place (it reads env at module scope). */
async function loadRoute() {
  vi.resetModules();
  process.env.QUOTE_TOKEN_SECRET = TEST_SECRET;
  return import("../app/api/quotation/[id]/route");
}

function getReq(id: string, token?: string | null) {
  const qs = token === undefined ? "" : `?token=${token ?? ""}`;
  return new Request(`https://app.vitharn.com/api/quotation/${id}${qs}`);
}

function postReq(body: unknown) {
  return new Request(`https://app.vitharn.com/api/quotation/${QUOTE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: QUOTE_ID }) };

function seedHappyPath() {
  const validTok = validToken(QUOTE_ID);
  const futureExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString(); // 30 days
  tableResponses.quotation_share_tokens = {
    data: {
      quotation_id: QUOTE_ID,
      token_hash: hashToken(validTok),
      expires_at: futureExpiry,
      revoked_at: null,
    },
    error: null,
  };
  tableResponses.quotations = {
    data: {
      id: QUOTE_ID,
      quote_no: "JVUPVC-0042",
      date: "2026-08-08",
      customer_name: "Test Customer",
      reference: "REF-1",
      address: "Hyderabad",
      contact_no: "9999999999",
      transport_cost: 2500,
      email: "customer@example.com",
      status: "sent",
      include_gst: true,
      gst_percentage: 18,
      client_id: "venkateshwara",
    },
    error: null,
  };
  tableResponses.measured_items = {
    data: [
      {
        code: "W1",
        description: "Sliding Window",
        width: 1200,
        height: 1500,
        units: 2,
        glass: "5mm",
        rate: 450,
      },
    ],
    error: null,
  };
  tableResponses.unmeasured_items = {
    data: [{ description: "Installation", units: 1, rate: 3000 }],
    error: null,
  };
  tableResponses.clients = {
    data: {
      config: { companyName: "Venkateshwara uPVC", primaryColor: "#1E3A5F" },
    },
    error: null,
  };
}

beforeEach(() => {
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  selectCalls.length = 0;
  updateCalls.length = 0;
});

afterEach(() => {
  delete process.env.QUOTE_TOKEN_SECRET;
});

// ---------------------------------------------------------------------------
describe("GET /api/quotation/[id] — token gate", () => {
  it("rejects a request with NO token (403) and never queries the database", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID), params);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid or missing token",
    });
    // The important half of the assertion: it must fail CLOSED, before any read.
    expect(selectCalls).toEqual([]);
  });

  it("rejects an empty token (403)", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, ""), params);
    expect(res.status).toBe(403);
    expect(selectCalls).toEqual([]);
  });

  it("rejects a wrong token (403)", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, "deadbeefdeadbeef"), params);
    expect(res.status).toBe(403);
    // Route must query token table to validate hash; only quotation table must not be queried
    expect(selectCalls).not.toContain("quotations");
  });

  it("rejects a token generated for a DIFFERENT quotation id (403)", async () => {
    // The IDOR case: a customer with one valid link tries it on someone else's
    // quote id. The HMAC is bound to the id, so this must fail.
    const { GET } = await loadRoute();
    seedHappyPath();
    const otherToken = validToken("99999999-8888-7777-6666-555555555555");
    const res = await GET(getReq(QUOTE_ID, otherToken), params);
    expect(res.status).toBe(403);
    // Route must query token table to validate hash; only quotation table must not be queried
    expect(selectCalls).not.toContain("quotations");
  });

  it("rejects a truncated / padded token (403)", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const good = validToken(QUOTE_ID);
    for (const bad of [good.slice(0, 15), good + "0", good.toUpperCase()]) {
      const res = await GET(getReq(QUOTE_ID, bad), params);
      expect(res.status, `token "${bad}" must be rejected`).toBe(403);
    }
    // Route must query token table to validate hash; only quotation table must not be queried
    expect(selectCalls).not.toContain("quotations");
  });

  it("accepts the correct token and returns 200", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/quotation/[id] — response contract", () => {
  it("returns the exact top-level shape the client destructures", async () => {
    // app/quote/[id]/page.tsx does `const { quotation, measured, unmeasured,
    // clientConfig } = json`. Renaming any of these keys is a breaking change
    // that TypeScript will NOT catch across the fetch boundary.
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["clientConfig", "measured", "quotation", "token", "unmeasured"].sort(),
    );
  });

  it("returns every quotation field the PDF/preview needs", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    const { quotation } = await res.json();
    for (const field of [
      "id",
      "quote_no",
      "date",
      "customer_name",
      "contact_no",
      "transport_cost",
      "status",
      "include_gst",
      "gst_percentage",
    ]) {
      expect(quotation, `missing field ${field}`).toHaveProperty(field);
    }
    // include_gst must survive as a BOOLEAN, not the string "true" — the money
    // math branches on it and "false" is truthy.
    expect(typeof quotation.include_gst).toBe("boolean");
  });

  it("normalises null item arrays to [] so the client can .map() safely", async () => {
    // A quotation with no line items returns `data: null` from supabase-js.
    // If that null reaches the client, `measured.map(...)` throws and the whole
    // customer-facing page white-screens.
    const { GET } = await loadRoute();
    seedHappyPath();
    tableResponses.measured_items = { data: null, error: null };
    tableResponses.unmeasured_items = { data: null, error: null };
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    const body = await res.json();
    expect(body.measured).toEqual([]);
    expect(body.unmeasured).toEqual([]);
  });

  it("NEVER leaks portalPasswordHash or other secrets in clientConfig", async () => {
    // P0 REGRESSION. This route is PUBLIC — the only gate is a share token that
    // every customer who was ever emailed a quote holds. It used to return
    // `clients.config` wholesale, which carries `portalPasswordHash` (an
    // unsalted SHA-256 of the tenant's portal password), `supabaseAnonKey` and
    // `adminEmails`. Any recipient of any quotation could read the tenant's
    // credentials straight out of the JSON.
    //
    // The route now emits a strict ALLOW-list of branding fields. This test
    // seeds a config containing secrets and asserts none of them survive.
    const { GET } = await loadRoute();
    seedHappyPath();
    tableResponses.clients = {
      data: {
        config: {
          companyName: "KPR Fabricators",
          companyEmail: "kpr@example.com",
          logoUrl: "https://cdn.example.com/logo.png",
          portalPasswordHash:
            "8622f0f69c91819119a8acf60a248d7b36fdb7ccf857ba8f85cf7f2767ff8265",
          supabaseAnonKey: "eyJhbGciOiJIUzI1NiJ9.super-secret-anon-key",
          adminEmails: ["owner@example.com"],
          isPaid: true,
          trialExpiresAt: "2026-09-01",
        },
      },
      error: null,
    };
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    const { clientConfig } = await res.json();

    // The branding the customer-facing page actually renders still arrives.
    expect(clientConfig.companyName).toBe("KPR Fabricators");
    expect(clientConfig.logoUrl).toBe("https://cdn.example.com/logo.png");

    // Nothing sensitive does.
    for (const secret of [
      "portalPasswordHash",
      "supabaseAnonKey",
      "adminEmails",
      "isPaid",
      "trialExpiresAt",
    ]) {
      expect(clientConfig, `leaked ${secret}`).not.toHaveProperty(secret);
    }

    // Belt and braces: the hash must not appear ANYWHERE in the serialised
    // payload, including nested under a key we did not think to check.
    const raw = JSON.stringify(clientConfig);
    expect(raw).not.toContain("8622f0f6");
    expect(raw).not.toContain("super-secret-anon-key");
  });

  it("returns {} for clientConfig when the client row is missing", async () => {
    // Orphaned client_id must degrade to default branding, not a 500.
    const { GET } = await loadRoute();
    seedHappyPath();
    tableResponses.clients = { data: null, error: { message: "not found" } };
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ clientConfig: {} });
  });

  it("returns 404 (not 500) when the quotation does not exist", async () => {
    const { GET } = await loadRoute();
    seedHappyPath();
    tableResponses.quotations = { data: null, error: { message: "PGRST116" } };
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Quotation not found" });
  });

  it("does NOT leak internal database error text to the caller", async () => {
    // Error strings from PostgREST can contain table names, column names and
    // policy names. That is free reconnaissance for an attacker.
    const { GET } = await loadRoute();
    tableResponses.quotations = {
      data: null,
      error: {
        message:
          'relation "public.quotations" violates policy "tenant_isolation"',
      },
    };
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/policy|relation|public\./i);
  });
});

describe("POST /api/quotation/[id] — approve / reject state machine", () => {
  beforeEach(() => {
    seedHappyPath();
  });

  it("rejects malformed JSON with 400, not a 500 crash", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq("{not json"), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("rejects a missing token with 403 before touching the database", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq({ action: "approve" }), params);
    expect(res.status).toBe(403);
    expect(updateCalls).toEqual([]);
  });

  it("rejects a bad token with 403 and performs no write", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postReq({ action: "approve", token: "0000000000000000" }),
      params,
    );
    expect(res.status).toBe(403);
    expect(updateCalls).toEqual([]);
  });

  it("maps approve/reject/review to approved/rejected/sent", async () => {
    const { POST } = await loadRoute();
    // The UPDATE now ends in `.select("id")` and requires a row to come back:
    // the route must prove a LIVE row actually matched before reporting
    // success. An empty result is a 404, not a silent `{ ok: true }`.
    tableResponses.quotations = { data: [{ id: QUOTE_ID }], error: null };
    const token = validToken(QUOTE_ID);
    const cases: Array<[string, string]> = [
      ["approve", "approved"],
      ["reject", "rejected"],
      ["review", "sent"],
    ];
    for (const [action, expected] of cases) {
      updateCalls.length = 0;
      const res = await POST(postReq({ action, token }), params);
      expect(res.status, `action ${action}`).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, status: expected });
      expect(updateCalls).toEqual([
        { table: "quotations", payload: { status: expected } },
      ]);
    }
  });

  it("returns 404 when the update matches no live row (soft-deleted or gone)", async () => {
    // A valid token for a quotation that has since been soft-deleted must NOT
    // resurrect it into won/lost, where the revenue KPIs would start counting
    // it again. The write is scoped `deleted = false`, so PostgREST returns an
    // empty set and the route must report that honestly instead of claiming
    // success for a write that changed nothing.
    const { POST } = await loadRoute();
    tableResponses.quotations = { data: [], error: null };
    const res = await POST(
      postReq({ action: "approve", token: validToken(QUOTE_ID) }),
      params,
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Quotation not found" });
  });

  it("rejects any action outside the whitelist with 400 and writes nothing", async () => {
    // Status is a business-critical enum (it drives win-rate reporting). An
    // arbitrary string here would corrupt every dashboard aggregate.
    const { POST } = await loadRoute();
    const token = validToken(QUOTE_ID);
    for (const action of [
      "delete",
      "APPROVE",
      "won",
      "",
      null,
      undefined,
      42,
      { a: 1 },
    ]) {
      updateCalls.length = 0;
      const res = await POST(postReq({ action, token }), params);
      expect(
        res.status,
        `action ${JSON.stringify(action)} must be rejected`,
      ).toBe(400);
      expect(updateCalls).toEqual([]);
    }
  });

  it("returns 500 when the update fails, and does not claim success", async () => {
    const { POST } = await loadRoute();
    tableResponses.quotations = {
      data: null,
      error: { message: "write failed" },
    };
    const res = await POST(
      postReq({ action: "approve", token: validToken(QUOTE_ID) }),
      params,
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to update" });
  });
});

describe("token derivation — security properties", () => {
  it("is deterministic for the same id + secret", async () => {
    expect(validToken(QUOTE_ID)).toBe(validToken(QUOTE_ID));
  });

  it("differs for different quotation ids", async () => {
    expect(validToken("a")).not.toBe(validToken("b"));
  });

  it("differs when the secret rotates (rotation invalidates old links)", async () => {
    expect(validToken(QUOTE_ID, "secret-a")).not.toBe(
      validToken(QUOTE_ID, "secret-b"),
    );
  });

  it("is 16 hex chars — DOCUMENTED AS A WEAKNESS, only 64 bits of entropy", async () => {
    // Truncating an HMAC to 16 hex chars leaves 2^64 possibilities. That is not
    // brute-forceable over HTTP today, but it is the weakest link on a public,
    // unauthenticated, no-rate-limit endpoint. Logged for Nexy: consider 32
    // chars + rate limiting. This test pins the CURRENT behaviour so a change
    // is deliberate.
    const t = validToken(QUOTE_ID);
    expect(t).toMatch(/^[0-9a-f]{16}$/);
  });

  it("token validation works without QUOTE_TOKEN_SECRET (route uses DB hash, not secret)", async () => {
    // The route validates tokens by hashing with SHA-256 and comparing to
    // the stored hash in quotation_share_tokens. It does NOT use
    // QUOTE_TOKEN_SECRET for validation (that's only for token generation).
    // This test verifies the validation path works without the secret.
    vi.resetModules();
    delete process.env.QUOTE_TOKEN_SECRET;
    const { GET } = await import("../app/api/quotation/[id]/route");
    seedHappyPath();
    const res = await GET(getReq(QUOTE_ID, validToken(QUOTE_ID)), params);
    expect(res.status).toBe(200);
  });
});
