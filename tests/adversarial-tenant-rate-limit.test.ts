import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: Array<[string, unknown]> = [];
  const value: any = {
    calls,
    select(input: string) { calls.push(["select", input]); return value; },
    eq(field: string, input: unknown) { calls.push(["eq", { field, value: input }]); return value; },
    gt(field: string, input: unknown) { calls.push(["gt", { field, value: input }]); return value; },
    is(field: string, input: unknown) { calls.push(["is", { field, value: input }]); return value; },
    order(field: string) { calls.push(["order", field]); return value; },
    update(input: unknown) { calls.push(["update", input]); return value; },
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
  };
  return value;
}

const tokenChain = chain({ data: null, error: null });
const quotationChain = chain({ data: [{ id: "quote-b" }], error: null });
const tables: Record<string, any> = {
  quotation_share_tokens: tokenChain,
  quotations: quotationChain,
  measured_items: chain({ data: [], error: null }),
  unmeasured_items: chain({ data: [], error: null }),
  clients: chain({ data: { config: {} }, error: null }),
};

vi.mock("@/lib/supabase-client", () => {
  const supabaseAdmin = { from: (table: string) => tables[table] };
  return { supabaseAdmin, getSupabaseAdmin: () => supabaseAdmin, getSupabase: () => supabaseAdmin };
});
vi.mock("@/lib/quotation-token", () => ({ hashQuotationToken: (value: string) => `hash:${value}` }));

describe("adversarial tenant and quotation isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const table of Object.values(tables)) table.calls.length = 0;
    tokenChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    quotationChain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "quote-b" }], error: null }).then(resolve);
  });

  it("rejects a token minted for quote A when presented for quote B", async () => {
    tokenChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("../app/api/quotation/[id]/route");
    const response = await GET(new Request("https://app.vitharn.com/api/quotation/quote-b?token=token-for-a"), {
      params: Promise.resolve({ id: "quote-b" }),
    });
    expect(response.status).toBe(403);
    expect(tokenChain.calls).toContainEqual(["eq", { field: "quotation_id", value: "quote-b" }]);
    expect(tokenChain.calls).toContainEqual(["eq", { field: "token_hash", value: "hash:token-for-a" }]);
  });

  it("scopes customer status writes to the requested live quotation row", async () => {
    tokenChain.maybeSingle.mockResolvedValue({ data: { quotation_id: "quote-b" }, error: null });
    const { POST } = await import("../app/api/quotation/[id]/route");
    const response = await POST(new Request("https://app.vitharn.com/api/quotation/quote-b", {
      method: "POST", body: JSON.stringify({ token: "token-b", action: "approve" }),
    }), { params: Promise.resolve({ id: "quote-b" }) });
    expect(response.status).toBe(200);
    expect(quotationChain.calls).toContainEqual(["eq", { field: "id", value: "quote-b" }]);
    expect(quotationChain.calls).toContainEqual(["eq", { field: "deleted", value: false }]);
  });
});

describe("authentication rate-limit contract", () => {
  it("locks after five failures and clears after a successful login", async () => {
    const { authAttemptKey, clearAuthFailures, isAuthLocked, recordAuthFailure } = await import("../src/lib/auth-rate-limit");
    const request = new Request("https://app.vitharn.com/api/portal_auth", { headers: { "x-forwarded-for": "203.0.113.10" } });
    const key = authAttemptKey(request, "portal", "User@Example.com");
    clearAuthFailures(key);
    expect(key).toBe("portal:user@example.com:203.0.113.10");
    expect(isAuthLocked(key)).toBe(0);
    for (let i = 0; i < 4; i++) expect(recordAuthFailure(key)).toBe(0);
    expect(recordAuthFailure(key)).toBeGreaterThan(0);
    expect(isAuthLocked(key)).toBeGreaterThan(0);
    clearAuthFailures(key);
    expect(isAuthLocked(key)).toBe(0);
  });

  it("binds buckets to the first trusted proxy address, not attacker-controlled identity casing", async () => {
    const { authAttemptKey } = await import("../src/lib/auth-rate-limit");
    const a = new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" } });
    const b = new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.5, 10.0.0.1" } });
    expect(authAttemptKey(a, "portal", "A@EXAMPLE.COM")).not.toBe(authAttemptKey(b, "portal", "a@example.com"));
  });
});
