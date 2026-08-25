/**
 * TEST 3 — AUTH / SESSION (src/lib/session.ts + src/lib/auth.ts)
 *
 * The session cookie IS the authorisation model for this app. `session.client_id`
 * is what every API route uses to scope a tenant's data. If a session can be
 * forged, altered, or made to survive tampering, one uPVC fabricator can read
 * another's quotations — the single worst failure this product can have.
 *
 * These tests assert the security PROPERTIES, not just the happy path:
 *   - a JWT signed with a different secret is rejected
 *   - a JWT with a mutated payload (client_id swap) is rejected
 *   - the `alg` header cannot be downgraded to `none` (classic JWT bypass)
 *   - an expired token is rejected
 *   - `decrypt` returns null on garbage instead of throwing (fail closed)
 *   - the cookie is HttpOnly + SameSite (XSS / CSRF surface)
 *
 * `next/headers` is mocked with an in-memory cookie jar so the session helpers
 * can run outside a request context.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";

const TEST_SECRET = "bugsy-test-jwt-secret-do-not-use-in-prod";

// ---------------------------------------------------------------------------
// In-memory cookie jar standing in for Next's request-scoped cookie store.
// ---------------------------------------------------------------------------
type CookieRecord = { name: string; value: string; options: Record<string, any> };
const jar = new Map<string, CookieRecord>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string, options: Record<string, any> = {}) => {
      jar.set(name, { name, value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

async function loadSession() {
  vi.resetModules();
  process.env.JWT_SECRET = TEST_SECRET;
  return import("@/lib/session");
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

beforeEach(() => {
  jar.clear();
});

// ---------------------------------------------------------------------------
describe("sha256() — password hashing", () => {
  it("produces the known SHA-256 vector for the empty string", async () => {
    const { sha256 } = await import("@/lib/auth");
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic and 64 lowercase hex chars", async () => {
    const { sha256 } = await import("@/lib/auth");
    const h = sha256("Kpr@1234");
    expect(h).toBe(sha256("Kpr@1234"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-sensitive and whitespace-sensitive", async () => {
    // Login compares hashes for exact equality. If anyone ever "helpfully"
    // trims or lowercases the password before hashing, every existing hash in
    // the database becomes unmatchable and all clients are locked out.
    const { sha256 } = await import("@/lib/auth");
    expect(sha256("test@123")).not.toBe(sha256("Test@123"));
    expect(sha256("test@123")).not.toBe(sha256("test@123 "));
  });

  it("handles unicode and very long passwords without throwing", async () => {
    const { sha256 } = await import("@/lib/auth");
    expect(sha256("पासवर्ड🔐")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("x".repeat(100_000))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("KNOWN WEAKNESS: unsalted, un-stretched SHA-256 (logged, not a pass)", async () => {
    // Documented deliberately. Plain SHA-256 has no salt and no work factor, so
    // the client password table is rainbow-table-able if the DB ever leaks.
    // Migrating to bcrypt/argon2 needs a dual-read migration path. This test
    // pins current behaviour so the change is intentional and coordinated.
    const { sha256 } = await import("@/lib/auth");
    expect(sha256("password")).toBe(
      "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    );
  });
});

describe("encrypt() / decrypt() — JWT round trip", () => {
  it("round-trips a customer session with client_id intact", async () => {
    const { encrypt, decrypt } = await loadSession();
    const token = await encrypt({
      role: "customer",
      email: "kprupvc@gmail.com",
      client_id: "kprupvc",
      session_id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const payload = await decrypt(token);
    expect(payload?.role).toBe("customer");
    expect(payload?.email).toBe("kprupvc@gmail.com");
    expect(payload?.client_id).toBe("kprupvc");
    expect(payload?.session_id).toBeDefined();
  });

  it("signs with HS256 and sets iat + 8-hour exp", async () => {
    const { encrypt } = await loadSession();
    const token = await encrypt({
      role: "admin",
      email: "kongaaadisheshu@gmail.com",
      session_id: crypto.randomUUID(),
      expiresAt: new Date(),
    });
    const { protectedHeader, payload } = await jwtVerify(token, key(TEST_SECRET));
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.iat).toBeTypeOf("number");
    const eightHours = 8 * 60 * 60;
    expect((payload.exp as number) - (payload.iat as number)).toBe(eightHours);
  });

  it("returns null for an empty / undefined token instead of throwing", async () => {
    const { decrypt } = await loadSession();
    await expect(decrypt(undefined)).resolves.toBeNull();
    await expect(decrypt("")).resolves.toBeNull();
  });

  it("returns null for structurally invalid garbage (fails closed)", async () => {
    const { decrypt } = await loadSession();
    for (const junk of ["not-a-jwt", "a.b.c", "....", "null", "{}", "Bearer x"]) {
      await expect(decrypt(junk), `junk "${junk}"`).resolves.toBeNull();
    }
  });
});

describe("decrypt() — forgery resistance", () => {
  it("REJECTS a token signed with a different secret", async () => {
    // The attack: attacker knows the payload shape and mints their own admin
    // token. Without signature verification this walks straight in.
    const { decrypt } = await loadSession();
    const forged = await new SignJWT({ role: "admin", email: "attacker@evil.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key("attacker-guessed-secret"));
    await expect(decrypt(forged)).resolves.toBeNull();
  });

  it("REJECTS a token whose payload was mutated after signing (tenant swap)", async () => {
    // The cross-tenant attack: take your own valid cookie, base64-edit
    // client_id from "kprupvc" to "venkateshwara", replay it.
    const { encrypt, decrypt } = await loadSession();
    const token = await encrypt({
      role: "customer",
      email: "kprupvc@gmail.com",
      client_id: "kprupvc",
      session_id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const [h, p, s] = token.split(".");
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    decoded.client_id = "venkateshwara";
    const tampered =
      h + "." + Buffer.from(JSON.stringify(decoded)).toString("base64url") + "." + s;

    expect(tampered).not.toBe(token); // sanity: we really did change it
    await expect(decrypt(tampered)).resolves.toBeNull();
  });

  it("REJECTS a role escalation from customer to admin", async () => {
    const { encrypt, decrypt } = await loadSession();
    const token = await encrypt({
      role: "customer",
      email: "kprupvc@gmail.com",
      client_id: "kprupvc",
      session_id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const [h, p, s] = token.split(".");
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    decoded.role = "admin";
    const escalated =
      h + "." + Buffer.from(JSON.stringify(decoded)).toString("base64url") + "." + s;
    await expect(decrypt(escalated)).resolves.toBeNull();
  });

  it("REJECTS the alg:none downgrade attack", async () => {
    // Classic JWT bypass: strip the signature and declare alg "none". The route
    // pins `algorithms: ["HS256"]`, so this must be refused.
    const { decrypt } = await loadSession();
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ role: "admin", email: "attacker@evil.com", exp: 9999999999 }),
    ).toString("base64url");
    await expect(decrypt(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it("REJECTS an algorithm swap to HS512", async () => {
    // Even with the RIGHT secret, a different alg must not be accepted — the
    // allow-list exists so alg is never attacker-controlled.
    const { decrypt } = await loadSession();
    const token = await new SignJWT({ role: "admin", email: "a@b.com" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key(TEST_SECRET));
    await expect(decrypt(token)).resolves.toBeNull();
  });

  it("REJECTS an expired token", async () => {
    const { decrypt } = await loadSession();
    const expired = await new SignJWT({ role: "customer", email: "old@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired an hour ago
      .sign(key(TEST_SECRET));
    await expect(decrypt(expired)).resolves.toBeNull();
  });

  it("REJECTS a signature copied from a different token", async () => {
    const { encrypt, decrypt } = await loadSession();
    const a = await encrypt({
      role: "customer", email: "a@x.com", client_id: "a", session_id: crypto.randomUUID(), expiresAt: new Date() });
    const b = await encrypt({
      role: "customer", email: "b@x.com", client_id: "b", session_id: crypto.randomUUID(), expiresAt: new Date() });
    const spliced = a.split(".").slice(0, 2).join(".") + "." + b.split(".")[2];
    await expect(decrypt(spliced)).resolves.toBeNull();
  });
});

describe("createSession() — cookie hardening", () => {
  it("sets an HttpOnly cookie so XSS cannot read the session", async () => {
    const { createSession } = await loadSession();
    await createSession({ role: "customer", email: "kprupvc@gmail.com", client_id: "kprupvc" });
    const c = jar.get("session");
    expect(c).toBeDefined();
    expect(c!.options.httpOnly).toBe(true);
  });

  it("sets SameSite=lax and path=/ (CSRF surface reduction)", async () => {
    const { createSession } = await loadSession();
    await createSession({ role: "admin", email: "kongaaadisheshu@gmail.com" });
    const c = jar.get("session")!;
    expect(c.options.sameSite).toBe("lax");
    expect(c.options.path).toBe("/");
  });

  it("sets an expiry roughly 8 hours out, never a session-only cookie", async () => {
    const { createSession } = await loadSession();
    const before = Date.now();
    await createSession({ role: "admin", email: "a@b.com" });
    const exp = jar.get("session")!.options.expires as Date;
    const eightHours = 8 * 60 * 60 * 1000;
    expect(exp.getTime() - before).toBeGreaterThan(eightHours - 5000);
    expect(exp.getTime() - before).toBeLessThan(eightHours + 5000);
  });

  it("stores a real verifiable JWT, not the raw payload", async () => {
    // Guards against a refactor that ever writes JSON straight into the cookie.
    const { createSession } = await loadSession();
    await createSession({ role: "customer", email: "kprupvc@gmail.com", client_id: "kprupvc" });
    const value = jar.get("session")!.value;
    expect(value.split(".")).toHaveLength(3);
    expect(value).not.toContain("kprupvc@gmail.com"); // must not be plaintext
    const { payload } = await jwtVerify(value, key(TEST_SECRET));
    expect(payload.client_id).toBe("kprupvc");
  });
});

describe("getSession() / deleteSession()", () => {
  it("returns null when no cookie is present", async () => {
    const { getSession } = await loadSession();
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the payload for a valid cookie", async () => {
    const { createSession, getSession } = await loadSession();
    await createSession({ role: "customer", email: "akshayaupvc@gmail.com", client_id: "akshaya" });
    const s = await getSession();
    expect(s?.role).toBe("customer");
    expect(s?.client_id).toBe("akshaya");
  });

  it("returns null when the stored cookie has been tampered with", async () => {
    const { createSession, getSession } = await loadSession();
    await createSession({ role: "customer", email: "a@b.com", client_id: "aaa" });
    const c = jar.get("session")!;
    jar.set("session", { ...c, value: c.value.slice(0, -3) + "xyz" });
    await expect(getSession()).resolves.toBeNull();
  });

  it("deleteSession() actually removes the cookie (logout works)", async () => {
    const { createSession, deleteSession, getSession } = await loadSession();
    await createSession({ role: "admin", email: "a@b.com" });
    expect(jar.has("session")).toBe(true);
    await deleteSession();
    expect(jar.has("session")).toBe(false);
    await expect(getSession()).resolves.toBeNull();
  });
});

describe("JWT_SECRET configuration", () => {
  it("a session minted under one secret is invalid under another (rotation works)", async () => {
    const { encrypt } = await loadSession();
    const token = await encrypt({
      role: "admin", email: "a@b.com", session_id: crypto.randomUUID(), expiresAt: new Date() });

    vi.resetModules();
    process.env.JWT_SECRET = "a-completely-different-secret";
    const rotated = await import("@/lib/session");
    await expect(rotated.decrypt(token)).resolves.toBeNull();
  });

  it("ISO-10: fail-closed without JWT_SECRET — import succeeds (lazy resolution), but signing throws and verifying returns null", async () => {
    // HISTORY: this used to assert `import("@/lib/session")` REJECTS when
    // JWT_SECRET is missing. Commit 40f3323 (21-08-2026) made secret
    // resolution LAZY on purpose — getEncodedKey() now reads process.env
    // per-call inside the function body (session.ts:5-9) so builds/dev servers
    // can start without env vars. The SECURITY CONTRACT is unchanged and is
    // what we assert here: with no secret, nothing can be signed or verified,
    // and there is still no fallback to a public/default key.
    vi.resetModules();
    const previousSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      // 1. Module IMPORT must succeed — resolution is lazy by design.
      const session = await import("@/lib/session");
      expect(typeof session.encrypt).toBe("function");
      expect(typeof session.decrypt).toBe("function");

      // 2. Signing WITHOUT a secret must THROW — fail closed, never fall back.
      await expect(
        session.encrypt({
          role: "customer",
          email: "kprupvc@gmail.com",
          client_id: "kprupvc",
          session_id: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      ).rejects.toThrow("JWT_SECRET environment variable is missing");

      // 3. Verifying WITHOUT a secret must fail closed: decrypt() swallows the
      //    accessor error by design and returns null (never accepts, never crashes).
      await expect(session.decrypt("not-a-jwt")).resolves.toBeNull();

      // 4. The SAME freshly-imported module works the moment the secret is set,
      //    proving the failures above came from the missing env, not a broken module.
      process.env.JWT_SECRET = TEST_SECRET;
      const token = await session.encrypt({
        role: "customer",
        email: "kprupvc@gmail.com",
        client_id: "kprupvc",
        session_id: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      expect(token.split(".")).toHaveLength(3);
      const payload = await session.decrypt(token);
      expect(payload?.role).toBe("customer");
      expect(payload?.client_id).toBe("kprupvc");
    } finally {
      // Restore the baseline so later suites/tests are unaffected.
      process.env.JWT_SECRET = previousSecret ?? TEST_SECRET;
    }
  });
});
