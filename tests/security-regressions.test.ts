/**
 * TEST — SECURITY & CORRECTNESS REGRESSIONS (audit of 09-08-2026)
 *
 * Every test in this file corresponds to a defect that was LIVE in production
 * code and is now fixed. The point of the file is that these specific holes can
 * never silently reopen: each test fails loudly if someone reverts the guard.
 *
 * The defects, in severity order:
 *
 *   BUG-SEC-001 (CRITICAL, privilege escalation / billing bypass)
 *     /api/save_client wrote `config` verbatim from the request body. A customer
 *     authenticated for their OWN client id could post `config.isPaid = true`,
 *     which is the exact field portal_auth's trial gate reads — granting
 *     themselves a permanent free licence. Same body could set `is_active` and
 *     `trial_expires_at`.
 *
 *   BUG-SEC-005 (CRITICAL, authenticated open mail relay)
 *     /api/send_email accepted any session with an email, including the
 *     self-issued `signup` role that portal_auth hands to ANY unrecognised
 *     address. That is arbitrary HTML to arbitrary recipients from Vitharn's
 *     own SMTP — phishing + domain blacklisting.
 *
 *   BUG-SEC-002/004/006 (HIGH, password reset)
 *     OTPs were stored in `sent_emails.body` as literal plaintext, expiry was
 *     best-effort (a parse throw fell through to a SUCCESSFUL reset), and the
 *     code was never consumed so it could be replayed for a full 15 minutes.
 *
 *   BUG-SEC-003 (MEDIUM, account enumeration)
 *     The reset endpoint 404'd on unknown emails, confirming which addresses
 *     hold accounts.
 *
 *   BUG-SEC-007 (MEDIUM, unvalidated tenant on anonymous write)
 *     /api/reviews inserted rows for an attacker-supplied clientId with the
 *     service-role key and no existence check.
 *
 *   BUG-FUNC-001 (HIGH, broken auth — total outage for clients)
 *     /api/save_client selected only "id,config" then compared
 *     `clientMatch.password_hash`, a column it never fetched. Always undefined,
 *     so EVERY non-admin save died with 403 "hash mismatch".
 *
 *   BUG-FUNC-002 (MEDIUM, silent no-op)
 *     Review PATCH for another tenant's id matched zero rows but still returned
 *     {ok:true} — the UI reported "saved" for a write that never happened.
 *
 * Hermetic: Supabase is a spy, sessions and mail are in-memory. No network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const TENANT_A = "venkateshwara";
const TENANT_B = "kprupvc";

// ---------------------------------------------------------------------------
// Supabase spy
// ---------------------------------------------------------------------------
type Call = {
  op: "get" | "post" | "patch" | "delete";
  table: string;
  qs: any;
  body?: any;
};
let calls: Call[] = [];
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
  supaPatch: async (t: string, qs: any, body: any) =>
    record("patch", t, qs, body),
  supaDelete: async (t: string, qs: any = {}) => record("delete", t, qs),
  uploadLogoFile: async () => "https://example.test/logo.png",
}));

// Mail spy — records what would have been sent.
type Mail = { to: string; subject: string; html?: string };
let mails: Mail[] = [];
let otpMails: Array<{ to: string; code: string }> = [];

vi.mock("@/lib/mail", () => ({
  sendMail: async (m: any) => {
    mails.push({ to: m.to, subject: m.subject, html: m.html });
  },
  sendOtpEmail: async (to: string, code: string) => {
    otpMails.push({ to, code });
  },
  sendWelcomeEmail: async () => {},
  sendSignupNotification: async () => {},
  sendSignupConfirmation: async () => {},
  sendAdminCompose: async () => {},
}));

let currentSession: any = null;
vi.mock("@/lib/session", () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
  deleteSession: async () => {},
}));

// Mock hashPassword to return input unchanged for predictable testing
vi.mock("@/lib/auth", () => ({
  hashPassword: async (pw: string) => pw,
  sha256: (s: string) => s,
  verifyPassword: async (pw: string, hash: string) => pw === hash,
}));

// The cached-clients helper backing the /api/reviews tenant existence check.
let knownClients: any[] = [];
vi.mock("@/lib/slug", async (orig) => {
  const actual: any = await (orig as any)();
  return { ...actual, getCachedClients: async () => knownClients };
});

function post(url: string, body: any) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const customerA = {
  role: "customer",
  email: "jvenkateshupvc@gmail.com",
  client_id: TENANT_A,
};
const adminSession = { role: "admin", email: "kongaaadisheshu@gmail.com" };
/** portal_auth mints this for ANY unrecognised email, unverified. */
const signupSession = {
  role: "signup",
  email: "attacker@evil.com",
  signup_request_id: "999",
};

beforeEach(() => {
  calls = [];
  mails = [];
  otpMails = [];
  knownClients = [];
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  currentSession = null;
  process.env.JWT_SECRET = "bugsy-test-jwt-secret-do-not-use-in-prod";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  vi.resetModules();
});

// ===========================================================================
// BUG-SEC-005 — /api/send_email was an authenticated open mail relay
// ===========================================================================
describe("BUG-SEC-005 — /api/send_email must not be an open relay", () => {
  const payload = {
    to: "victim@example.com",
    subject: "Your account needs attention",
    html: "<a href='https://evil.test'>Click here</a>",
  };

  it("rejects an anonymous caller (401) and sends nothing", async () => {
    const { POST } = await import("../app/api/send_email/route");
    const res = await POST(post("http://localhost/api/send_email", payload));
    expect(res.status).toBe(401);
    expect(mails).toHaveLength(0);
  });

  it("REGRESSION: rejects a self-issued signup-role session (403) and sends nothing", async () => {
    // This is the whole bug: a stranger POSTs one novel email to /api/portal_auth,
    // receives a real signed cookie, and previously could then relay mail.
    currentSession = signupSession;
    const { POST } = await import("../app/api/send_email/route");
    const res = await POST(post("http://localhost/api/send_email", payload));
    expect(res.status).toBe(403);
    expect(
      mails,
      "a signup-role session relayed mail — the open relay is back",
    ).toHaveLength(0);
  });

  it("still allows a legitimate customer to send", async () => {
    currentSession = customerA;
    const { POST } = await import("../app/api/send_email/route");
    const res = await POST(post("http://localhost/api/send_email", payload));
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("victim@example.com");
  });

  it("still allows an admin to send", async () => {
    currentSession = adminSession;
    const { POST } = await import("../app/api/send_email/route");
    const res = await POST(post("http://localhost/api/send_email", payload));
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(1);
  });

  it("rejects a recipient with no @ and never reaches SMTP", async () => {
    currentSession = customerA;
    const { POST } = await import("../app/api/send_email/route");
    const res = await POST(
      post("http://localhost/api/send_email", {
        ...payload,
        to: "not-an-email",
      }),
    );
    expect(res.status).toBe(400);
    expect(mails).toHaveLength(0);
  });
});

// ===========================================================================
// BUG-SEC-001 / BUG-FUNC-001 — /api/save_client
// ===========================================================================
describe("BUG-SEC-001 — a customer cannot grant themselves a paid licence", () => {
  const CUSTOMER_HASH = "correct-portal-hash";

  function seedTenantA(configOverrides: any = {}) {
    // Row returned for BOTH the auth lookup and the pre-write read.
    fixtures["clients"] = [
      {
        id: TENANT_A,
        password_hash: CUSTOMER_HASH,
        is_active: true,
        trial_expires_at: "2026-08-16T00:00:00.000Z",
        config: {
          companyEmail: "jvenkateshupvc@gmail.com",
          isPaid: false,
          trialEndsAt: "2026-08-16T00:00:00.000Z",
          portalPasswordHash: CUSTOMER_HASH,
          ...configOverrides,
        },
      },
    ];
    fixtures["admins"] = [];
  }

  /** The config actually persisted by the route. */
  function writtenConfig() {
    const write = calls.find(
      (c) => c.table === "clients" && (c.op === "patch" || c.op === "post"),
    );
    expect(write, "route performed no write to clients").toBeDefined();
    return write!.body.config;
  }

  it("REGRESSION: ignores config.isPaid smuggled in by a customer", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        config: { companyName: "Venkateshwara", isPaid: true },
      }),
    );
    expect(res.status).toBe(200);
    expect(
      writtenConfig().isPaid,
      "customer escalated to isPaid=true — the trial gate is bypassed",
    ).toBe(false);
  });

  it("REGRESSION: ignores a customer-supplied far-future trialEndsAt", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        config: { trialEndsAt: "2099-01-01T00:00:00.000Z" },
      }),
    );
    expect(writtenConfig().trialEndsAt).toBe("2026-08-16T00:00:00.000Z");
  });

  it("REGRESSION: a customer cannot flip is_active or extend trial_expires_at", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        is_active: true,
        trial_expires_at: "2099-01-01T00:00:00.000Z",
        config: {},
      }),
    );
    const write = calls.find((c) => c.table === "clients" && c.op === "patch");
    expect(write!.body.trial_expires_at).toBe("2026-08-16T00:00:00.000Z");
  });

  it("an ADMIN may still legitimately set isPaid (billing is an admin power)", async () => {
    fixtures["admins"] = [
      { email: "kongaaadisheshu@gmail.com", password_hash: "admin-hash" },
    ];
    fixtures["clients"] = [{ id: TENANT_A, config: { isPaid: false } }];
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "kongaaadisheshu@gmail.com",
        admin_password_hash: "admin-hash",
        config: { isPaid: true },
      }),
    );
    expect(res.status).toBe(200);
    expect(writtenConfig().isPaid).toBe(true);
  });

  it("accepts a matching HttpOnly admin session without a password hash", async () => {
    fixtures["admins"] = [
      { email: "kongaaadisheshu@gmail.com", password_hash: "admin-hash" },
    ];
    fixtures["clients"] = [{ id: TENANT_A, config: { isPaid: false } }];
    currentSession = adminSession;
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "KONGAAADISHESHU@GMAIL.COM",
        config: { isPaid: true },
      }),
    );
    expect(res.status).toBe(200);
    expect(writtenConfig().isPaid).toBe(true);
  });

  it("BUG-FUNC-001: a correct customer hash is ACCEPTED (was always 403)", async () => {
    // The route used to `select: "id,config"` and then compare
    // `clientMatch.password_hash` — undefined — so this path always 403'd and
    // no client could ever save their settings.
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        config: { companyName: "Venkateshwara UPVC" },
      }),
    );
    expect(res.status, "client settings save is broken for every tenant").toBe(
      200,
    );
  });

  it("the auth query actually fetches password_hash (root cause of FUNC-001)", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        config: {},
      }),
    );
    const lookup = calls.find(
      (c) =>
        c.table === "clients" &&
        c.op === "get" &&
        String(c.qs?.select || "").includes("config"),
    );
    expect(
      String(lookup!.qs.select),
      "authenticating on a column that was never selected is always undefined",
    ).toContain("password_hash");
  });

  it("a WRONG customer hash is still rejected (403)", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: "wrong-hash",
        config: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("a customer cannot save against ANOTHER tenant's id (403)", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_B,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        config: {},
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "clients" && c.op !== "get")).toBe(
      false,
    );
  });

  it("a customer cannot delete a client", async () => {
    seedTenantA();
    const { POST } = await import("../app/api/save_client/route");
    const res = await POST(
      post("http://localhost/api/save_client", {
        id: TENANT_A,
        admin_email: "jvenkateshupvc@gmail.com",
        admin_password_hash: CUSTOMER_HASH,
        _delete: true,
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });
});

// ===========================================================================
// BUG-SEC-002/003/004/006 — password reset OTP
// ===========================================================================
describe("password reset OTP hardening", () => {
  const EMAIL = "jvenkateshupvc@gmail.com";

  function seedAccount() {
    fixtures["admins"] = [{ email: EMAIL, password_hash: "old" }];
  }

  /** The row the route wrote into sent_emails. */
  function loggedOtpRow() {
    const w = calls.find((c) => c.table === "sent_emails" && c.op === "post");
    expect(w, "no OTP was logged").toBeDefined();
    return w!.body;
  }

  it("BUG-SEC-002: the stored OTP is a hash, never the plaintext code", async () => {
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    const res = await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    expect(res.status).toBe(200);

    const code = otpMails[0].code;
    expect(code).toMatch(/^\d{6}$/);
    const stored = String(loggedOtpRow().body);
    expect(stored, "plaintext OTP is readable in sent_emails").not.toContain(
      code,
    );
    expect(stored).toMatch(/^OTPHASH: [a-f0-9]{64}$/);
  });

  it("BUG-SEC-003: an unknown email gets the same {sent:true} (no enumeration)", async () => {
    fixtures["admins"] = [];
    fixtures["client_public"] = [];
    const { POST } = await import("../app/api/reset_client_password/route");
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: "nobody@nowhere.test",
      }),
    );
    expect(res.status, "404 here confirms which emails hold accounts").toBe(
      200,
    );
    expect(await res.json()).toEqual({ sent: true });
    expect(otpMails, "no mail should be sent to a non-account").toHaveLength(0);
  });

  it("a wrong OTP is rejected and the password is NOT changed", async () => {
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    const storedBody = loggedOtpRow().body;
    calls = [];

    fixtures["sent_emails"] = [
      { id: 1, body: storedBody, created_at: new Date().toISOString() },
    ];
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: "000000",
        new_hash: "attacker-chosen",
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "admins" && c.op === "patch")).toBe(
      false,
    );
  });

  it("the correct OTP resets the password", async () => {
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    const code = otpMails[0].code;
    const storedBody = loggedOtpRow().body;
    calls = [];

    fixtures["sent_emails"] = [
      { id: 1, body: storedBody, created_at: new Date().toISOString() },
    ];
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: code,
        new_hash: "brand-new-hash",
      }),
    );
    expect(res.status).toBe(200);
    const patch = calls.find((c) => c.table === "admins" && c.op === "patch");
    expect(patch!.body.password_hash).toBe("brand-new-hash");
  });

  it("BUG-SEC-006: a used OTP is burned so it cannot be replayed", async () => {
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    const code = otpMails[0].code;
    const storedBody = loggedOtpRow().body;
    calls = [];

    fixtures["sent_emails"] = [
      { id: 1, body: storedBody, created_at: new Date().toISOString() },
    ];
    await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: code,
        new_hash: "first-reset",
      }),
    );
    const burn = calls.find(
      (c) => c.table === "sent_emails" && c.op === "patch",
    );
    expect(burn, "the OTP was never consumed — it is replayable").toBeDefined();
    expect(String(burn!.body.body)).not.toMatch(/[a-f0-9]{64}/);
  });

  it("BUG-SEC-004: an OTP with an unparseable timestamp FAILS CLOSED", async () => {
    // The old code wrapped expiry in try/catch and fell through to a successful
    // reset when the date could not be parsed — an OTP that never expired.
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    const code = otpMails[0].code;
    const storedBody = loggedOtpRow().body;
    calls = [];

    fixtures["sent_emails"] = [
      { id: 1, body: storedBody, created_at: "not-a-date" },
    ];
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: code,
        new_hash: "should-not-apply",
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "admins" && c.op === "patch")).toBe(
      false,
    );
  });

  it("an OTP older than 15 minutes is rejected", async () => {
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", { email: EMAIL }),
    );
    const code = otpMails[0].code;
    const storedBody = loggedOtpRow().body;
    calls = [];

    fixtures["sent_emails"] = [
      {
        id: 1,
        body: storedBody,
        created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      },
    ];
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: code,
        new_hash: "too-late",
      }),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "admins" && c.op === "patch")).toBe(
      false,
    );
  });

  it("an OTP issued for ANOTHER email cannot be replayed here", async () => {
    // hashOtp() mixes the email in precisely to kill cross-account replay.
    seedAccount();
    const { POST } = await import("../app/api/reset_client_password/route");
    await POST(
      post("http://localhost/api/reset_client_password", {
        email: "other@example.com",
      }),
    );
    // No account for that address, so nothing was issued; craft the far more
    // interesting case: a valid digest for a DIFFERENT email.
    calls = [];
    fixtures["admins"] = [{ email: EMAIL, password_hash: "old" }];
    const { createHash } = await import("crypto");
    const foreign = createHash("sha256")
      .update("other@example.com:123456")
      .digest("hex");
    fixtures["sent_emails"] = [
      {
        id: 1,
        body: "OTPHASH: " + foreign,
        created_at: new Date().toISOString(),
      },
    ];
    const res = await POST(
      post("http://localhost/api/reset_client_password", {
        email: EMAIL,
        otp: "123456",
        new_hash: "cross-account",
      }),
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// BUG-SEC-007 / BUG-FUNC-002 — reviews
// ===========================================================================
describe("BUG-SEC-007 — anonymous review writes must name a real tenant", () => {
  const good = {
    customerName: "Ramesh",
    rating: 5,
    reviewText: "Excellent windows, fitted on time.",
  };

  it("REGRESSION: rejects a clientId that does not exist (404), writing nothing", async () => {
    knownClients = [{ id: TENANT_A }, { id: TENANT_B }];
    const { POST } = await import("../app/api/reviews/route");
    const res = await POST(
      post("http://localhost/api/reviews", {
        ...good,
        clientId: "ghost-tenant",
      }),
    );
    expect(res.status).toBe(404);
    expect(
      calls.some((c) => c.table === "service_reviews" && c.op === "post"),
      "a row was written for a non-existent tenant",
    ).toBe(false);
  });

  it("accepts a review for a real tenant and scopes it to that tenant", async () => {
    knownClients = [{ id: TENANT_A }, { id: TENANT_B }];
    fixtures["service_reviews"] = [{ id: 1 }];
    const { POST } = await import("../app/api/reviews/route");
    const res = await POST(
      post("http://localhost/api/reviews", { ...good, clientId: TENANT_A }),
    );
    expect(res.status).toBe(200);
    const write = calls.find(
      (c) => c.table === "service_reviews" && c.op === "post",
    );
    expect(write!.body.client_id).toBe(TENANT_A);
  });

  it("still enforces the rating bounds (DB CHECK is the last line, not the first)", async () => {
    knownClients = [{ id: TENANT_A }];
    const { POST } = await import("../app/api/reviews/route");
    for (const rating of [0, 6, 2.5, "5" as any]) {
      const res = await POST(
        post("http://localhost/api/reviews", {
          ...good,
          clientId: TENANT_A,
          rating,
        }),
      );
      expect(res.status, `rating ${rating} was accepted`).toBe(400);
    }
  });

  it("rejects an over-long reviewText before it reaches the DB", async () => {
    knownClients = [{ id: TENANT_A }];
    const { POST } = await import("../app/api/reviews/route");
    const res = await POST(
      post("http://localhost/api/reviews", {
        ...good,
        clientId: TENANT_A,
        reviewText: "x".repeat(1001),
      }),
    );
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.op === "post")).toBe(false);
  });
});

describe("BUG-FUNC-002 — review moderation must not report a phantom success", () => {
  function patchReq(body: any) {
    return new Request("http://localhost/api/reviews/x/manage", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as any;
  }
  const params = (clientId: string) => ({
    params: Promise.resolve({ clientId }),
  });

  it("REGRESSION: a cross-tenant id yields 404, not {ok:true}", async () => {
    currentSession = customerA;
    fixtures["service_reviews"] = []; // filter matched nothing
    const { PATCH } =
      await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      patchReq({ id: 4242, isVisible: false }),
      params(TENANT_A),
    );
    expect(
      res.status,
      "a write that changed nothing was reported as saved",
    ).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("a real update still returns the updated row", async () => {
    currentSession = customerA;
    fixtures["service_reviews"] = [{ id: 7, is_visible: false }];
    const { PATCH } =
      await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      patchReq({ id: 7, isVisible: false }),
      params(TENANT_A),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).review.id).toBe(7);
  });

  it("an anonymous caller cannot moderate (401)", async () => {
    currentSession = null;
    const { PATCH } =
      await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      patchReq({ id: 7, isVisible: false }),
      params(TENANT_A),
    );
    expect(res.status).toBe(401);
    expect(calls.some((c) => c.op === "patch")).toBe(false);
  });

  it("a customer cannot moderate ANOTHER tenant's reviews (403)", async () => {
    currentSession = customerA;
    const { PATCH } =
      await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      patchReq({ id: 7, isVisible: false }),
      params(TENANT_B),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.op === "patch")).toBe(false);
  });

  it("a signup-role session cannot moderate (403)", async () => {
    currentSession = signupSession;
    const { PATCH } =
      await import("../app/api/reviews/[clientId]/manage/route");
    const res = await PATCH(
      patchReq({ id: 7, isVisible: false }),
      params(TENANT_A),
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.op === "patch")).toBe(false);
  });
});
