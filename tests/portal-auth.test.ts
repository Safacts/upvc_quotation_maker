/**
 * TEST 5 — /api/portal_auth (login surface) — Google Sign-In + password + trial
 *
 * Every login for every client passes through this ONE route. The Flutter web
 * app now sends `{mode:"google", email}` (new 08-08-2026 feature), the web
 * portal sends password mode, and the APK app sends password mode with a
 * portal hash. A regression here locks EVERY client out or — worse — mints a
 * customer session for the WRONG tenant.
 *
 * What is asserted:
 *   - google mode: registered admin → role admin; registered client → role
 *     customer + client_id + session; unknown email → role signup + a
 *     signup_requests row; deactivated client → 403; expired trial → 403.
 *   - password mode: correct admin/client hash → session; wrong → 401; a
 *     Google-created signup politely refuses a password (401 "use Google").
 *   - session mode returns the stored role; logout removes the cookie.
 *   - input validation: empty email → 400, malformed JSON → 400,
 *     missing service key → 500.
 *
 * Hermetic: Supabase is a recorder spy, next/headers is an in-memory jar, mail
 * is a no-op. No network, no live DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase recorder spy (same contract as client-isolation.test.ts)
// ---------------------------------------------------------------------------
type Call = { op: "get" | "post" | "patch" | "delete"; table: string; qs: any; body?: any };
const calls: Call[] = [];
const fixtures: Record<string, any> = {};

function record(op: Call["op"], table: string, qs: any = {}, body?: any) {
  calls.push({ op, table, qs, body });
  return fixtures[table] ?? [];
}

let serviceKeyConfigured = true;

vi.mock("@/lib/supabase", () => ({
  isServiceKeyConfigured: () => serviceKeyConfigured,
  supaGet: async (t: string, qs: any = {}) => record("get", t, qs),
  supaPost: async (t: string, body: any) => {
    record("post", t, {}, body);
    return fixtures[t] ?? [{ id: "new-row-id" }];
  },
  supaPatch: async (t: string, qs: any, body: any) => record("patch", t, qs, body),
}));

// ---------------------------------------------------------------------------
// Session jar — records createSession payloads so we can assert what a login
// minted, and serves them back to getSession (mode=session checks).
// ---------------------------------------------------------------------------
const minted: any[] = [];
let currentSession: any = null;

vi.mock("@/lib/session", () => ({
  createSession: async (payload: any) => {
    minted.push(payload);
    currentSession = payload;
  },
  getSession: async () => currentSession,
  deleteSession: async () => {
    currentSession = null;
  },
}));

vi.mock("@/lib/mail", () => ({
  sendSignupNotification: async () => {},
}));

vi.mock("jose", async () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === "invalid-token") throw new Error("bad token");
    return { payload: { email: token, email_verified: true } };
  }
}));

// ---------------------------------------------------------------------------
// Helpers + fixture builders
// ---------------------------------------------------------------------------
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const CLIENT_A = "venkateshwara";
const CLIENT_EMAIL_A = "jvenkateshupvc@gmail.com";
const ADMIN_EMAIL = "kongaaadisheshu@gmail.com";

/** A live, paying client: no trial lockout ever applies. */
function seedClientA(hash?: string, configExtra: Record<string, any> = {}) {
  fixtures.client_public = [
    { id: CLIENT_A, config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [] }, is_active: true },
  ];
  fixtures.clients = [
    {
      id: CLIENT_A,
      config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [], isPaid: true, ...configExtra },
      is_active: true,
      password_hash: hash,
    },
  ];
}

function seedAdmin(hash: string) {
  fixtures.admins = [{ email: ADMIN_EMAIL, password_hash: hash }];
}

function trialClient(trialEndsAt: string, isPaid = false, hash = "nope") {
  fixtures.client_public = [
    { id: CLIENT_A, config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [] }, is_active: true },
  ];
  fixtures.clients = [
    {
      id: CLIENT_A,
      config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [], isPaid, trialEndsAt },
      is_active: true,
      password_hash: hash,
    },
  ];
}

function inactiveClient() {
  fixtures.client_public = [
    { id: CLIENT_A, config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [] }, is_active: false },
  ];
  fixtures.clients = [
    {
      id: CLIENT_A,
      config: { companyEmail: CLIENT_EMAIL_A, adminEmails: [], isPaid: true },
      is_active: false,
      password_hash: "nope",
    },
  ];
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  minted.length = 0;
  currentSession = null;
  serviceKeyConfigured = true;
  process.env.JWT_SECRET = "bugsy-test-jwt-secret-do-not-use-in-prod";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  vi.resetModules();
});

async function authReq(body: unknown) {
  const { POST } = await import("../app/api/portal_auth/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("https://app.vitharn.com/api/portal_auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

const lastMinted = () => minted[minted.length - 1];

// ===========================================================================
describe("/api/portal_auth — GOOGLE mode (Flutter web + portal GSI)", () => {
  it("lets a registered ADMIN email in via Google (role admin + session)", async () => {
    seedAdmin(await sha256("whatever")); // google mode ignores the hash
    const res = await authReq({ mode: "google", email: ADMIN_EMAIL, credential: ADMIN_EMAIL });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "admin", email: ADMIN_EMAIL });
    expect(lastMinted()).toMatchObject({ role: "admin", email: ADMIN_EMAIL });
  });

  it("lets a registered CLIENT email in via Google (role customer + client_id + session)", async () => {
    seedClientA();
    const res = await authReq({ mode: "google", email: CLIENT_EMAIL_A, credential: CLIENT_EMAIL_A });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "customer", email: CLIENT_EMAIL_A, client_id: CLIENT_A });
    expect(lastMinted()).toMatchObject({ role: "customer", client_id: CLIENT_A });
  });

  it("creates a signup row + session for an UNKNOWN email (prebooking flow)", async () => {
    const res = await authReq({ mode: "google", email: "brand-new-client@gmail.com", credential: "brand-new-client@gmail.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "signup", status: "pending" });
    const writes = calls.filter((c) => c.op === "post" && c.table === "signup_requests");
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ email: "brand-new-client@gmail.com", auth_method: "google" });
    expect(lastMinted()).toMatchObject({ role: "signup" });
  });

  it("returns pending status for an existing signup request", async () => {
    fixtures.signup_requests = [
      { id: 42, email: "waiting@example.com", auth_method: "google", status: "pending" },
    ];
    const res = await authReq({ mode: "google", email: "waiting@example.com", credential: "waiting@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "signup", status: "pending", signup_request_id: "42" });
  });

  it("LOCKS OUT a client whose trial has expired (403, no session minted)", async () => {
    trialClient(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    const res = await authReq({ mode: "google", email: CLIENT_EMAIL_A, credential: CLIENT_EMAIL_A });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("trial") });
    expect(minted).toHaveLength(0);
  });

  it("admits a client whose trial is still active", async () => {
    trialClient(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
    const res = await authReq({ mode: "google", email: CLIENT_EMAIL_A, credential: CLIENT_EMAIL_A });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "customer", client_id: CLIENT_A });
  });

  it("blocks a deactivated client (403)", async () => {
    inactiveClient();
    const res = await authReq({ mode: "google", email: CLIENT_EMAIL_A, credential: CLIENT_EMAIL_A });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("deactivated") });
    expect(minted).toHaveLength(0);
  });
});

// ===========================================================================
describe("/api/portal_auth — PASSWORD mode (portal + APK)", () => {
  it("logs an admin in with the correct password", async () => {
    seedAdmin(await sha256("Kpr@1234"));
    const res = await authReq({ mode: "login", email: ADMIN_EMAIL, password: "Kpr@1234" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "admin" });
    expect(body.password_hash).toBeUndefined();
  });

  it("rejects an admin with a wrong password (401, no session, no signup row)", async () => {
    seedAdmin(await sha256("Kpr@1234"));
    const res = await authReq({ mode: "login", email: ADMIN_EMAIL, password: "wrong" });
    expect(res.status).toBe(401);
    expect(minted).toHaveLength(0);
    expect(calls.filter((c) => c.table === "signup_requests")).toEqual([]);
  });

  it("logs a paying client in with the correct portal password", async () => {
    seedClientA(await sha256("Vh@1234"));
    const res = await authReq({ mode: "login", email: CLIENT_EMAIL_A, password: "Vh@1234" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "customer", client_id: CLIENT_A });
    expect(body.password_hash).toBeUndefined();
    expect(lastMinted()).toMatchObject({ role: "customer", client_id: CLIENT_A });
  });

  it("rejects a client with the wrong password (401)", async () => {
    seedClientA(await sha256("Vh@1234"));
    const res = await authReq({ mode: "login", email: CLIENT_EMAIL_A, password: "nope" });
    expect(res.status).toBe(401);
    expect(minted).toHaveLength(0);
  });

  it("enforces the trial lockout on password login too", async () => {
    // Lockout fires only AFTER the correct hash matches — you must know the
    // password before the trial check runs.
    trialClient(new Date(Date.now() - 24 * 3600 * 1000).toISOString(), false, await sha256("nope"));
    const res = await authReq({ mode: "login", email: CLIENT_EMAIL_A, password: "nope" });
    expect(res.status).toBe(403);
    expect(minted).toHaveLength(0);
  });

  it("politely refuses a password for a Google-created signup (401 'use Google')", async () => {
    fixtures.signup_requests = [
      { id: 7, email: "guser@gmail.com", auth_method: "google", status: "pending" },
    ];
    const res = await authReq({ mode: "login", email: "guser@gmail.com", password: "x" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Google") });
  });

  it("registers a brand-new email with password mode (auth_method=password + hash stored)", async () => {
    const res = await authReq({ mode: "login", email: "newpass@example.com", password: "TopSecret!1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "signup", status: "pending" });
    const write = calls.find((c) => c.op === "post" && c.table === "signup_requests");
    expect(write!.body).toMatchObject({ email: "newpass@example.com", auth_method: "password" });
    expect(write!.body.password_hash).toBe(await sha256("TopSecret!1"));
    expect(lastMinted()).toMatchObject({ role: "signup" });
  });
});

// ===========================================================================
describe("/api/portal_auth — session / logout / validation", () => {
  it("mode=session returns the stored role for a valid session", async () => {
    currentSession = { role: "customer", email: CLIENT_EMAIL_A, client_id: CLIENT_A };
    const res = await authReq({ mode: "session" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ role: "customer", client_id: CLIENT_A });
    expect(body.password_hash).toBeUndefined();
  });

  it("mode=session rejects a missing session (401)", async () => {
    const res = await authReq({ mode: "session" });
    expect(res.status).toBe(401);
  });

  it("mode=logout clears the session", async () => {
    currentSession = { role: "admin", email: ADMIN_EMAIL };
    const res = await authReq({ mode: "logout" });
    expect(res.status).toBe(200);
    expect(currentSession).toBeNull();
  });

  it("google mode ignores empty email — relies on credential instead (10-08-2026 fix)", async () => {
    // Google Sign-In extracts email from the verified JWT credential, NOT the
    // request body. An empty body email must NOT cause "email required".
    // (No credential provided → expect 400 "missing Google credential".)
    const res = await authReq({ mode: "google", email: "  " });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing Google credential" });
  });

  it("password mode rejects empty email (400)", async () => {
    const res = await authReq({ mode: "login", email: "  " });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "email required" });
  });

  it("returns 500 when the service key is not configured (fail closed)", async () => {
    serviceKeyConfigured = false;
    const res = await authReq({ mode: "google", email: CLIENT_EMAIL_A });
    expect(res.status).toBe(500);
    expect(minted).toHaveLength(0);
  });

  it("rejects malformed JSON with a clear 400", async () => {
    const { POST } = await import("../app/api/portal_auth/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://app.vitharn.com/api/portal_auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
