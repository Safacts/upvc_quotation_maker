#!/usr/bin/env node
/**
 * e2e-smoke.mjs — LIVE production smoke test
 *
 * Proves the client-facing surfaces are actually up and serving the latest
 * build after a deploy, so a broken push is caught before a client calls.
 *
 * Defaults to https://app.vitharn.com; override with E2E_BASE_URL.
 * Run:  node scripts/e2e-smoke.mjs
 *
 * Checks (all read-only against prod):
 *   1. Landing page serves HTML.
 *   2. Flutter web app serves at /upvc/venkateshwara (portal slug).
 *   3. /app/ boots and references flutter_bootstrap.js.
 *   4. main.dart.js contains the Google Sign-In markers (google-signin-button
 *      view type + gsi/client loader) — the feature shipped on this deploy.
 *   5. /api/portal_auth answers OPTIONS with CORS preflight.
 *   6. Google-mode login for a REAL registered client email returns role
 *      admin/customer (no writes for registered users).
 *   7. Tenant review page loads (public review feed).
 *   8. OPTIONAL (E2E_ALLOW_SIGNUP_WRITE=true): an unknown email via Google
 *      mode gets role=signup — writes one signup_requests row, off by default.
 *
 * Exits non-zero on any failure so it can gate a release.
 */
const BASE = (process.env.E2E_BASE_URL || "https://app.vitharn.com").replace(/\/+$/, "");
const GOOGLE_EMAIL = process.env.E2E_GOOGLE_EMAIL || "jvenkateshupvc@gmail.com";
const ALLOW_SIGNUP_WRITE = process.env.E2E_ALLOW_SIGNUP_WRITE === "true";

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}

async function get(path, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(BASE + path, {
      headers: { "User-Agent": "e2e-smoke" },
      signal: ctrl.signal,
      redirect: "follow",
      ...opts,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`e2e-smoke → ${BASE}\n`);

  await check("1. Landing page serves HTML", async () => {
    const res = await get("/");
    if (res.status !== 200) throw new Error(`GET / → ${res.status}`);
    const html = await res.text();
    if (!/<html[\s>]|<title>/i.test(html)) throw new Error("landing is not HTML");
  });

  await check("2. Flutter app serves at /upvc/venkateshwara", async () => {
    const res = await get("/upvc/venkateshwara");
    if (res.status !== 200) throw new Error(`GET /upvc/venkateshwara → ${res.status}`);
  });

  await check("3. /app/ boots (flutter_bootstrap.js present)", async () => {
    const res = await get("/app/");
    if (res.status !== 200) throw new Error(`GET /app/ → ${res.status}`);
    const html = await res.text();
    if (!html.includes("flutter_bootstrap.js")) throw new Error("flutter_bootstrap.js missing from /app/");
  });

  await check("4. main.dart.js contains Google Sign-In markers", async () => {
    const res = await get("/app/main.dart.js");
    if (res.status !== 200) throw new Error(`GET /app/main.dart.js → ${res.status}`);
    const js = await res.text();
    if (!js.includes("google-signin-button")) throw new Error("google-signin-button view type not compiled in");
    if (!js.includes("gsi/client")) throw new Error("GSI loader not compiled in");
  });

  await check("5. /api/portal_auth CORS preflight", async () => {
    const res = await get("/api/portal_auth", { method: "OPTIONS" });
    if (res.status !== 200) throw new Error(`OPTIONS /api/portal_auth → ${res.status}`);
    if (!res.headers.get("access-control-allow-origin")) throw new Error("missing CORS headers");
  });

  await check("6. Google-mode login for a registered client", async () => {
    const res = await get("/api/portal_auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "google", email: GOOGLE_EMAIL }),
    });
    if (res.status !== 200) throw new Error(`POST google mode → ${res.status}`);
    const body = await res.json();
    if (body.role !== "admin" && body.role !== "customer") {
      throw new Error(`unexpected role ${body.role} for registered email`);
    }
    if (!body.email) throw new Error("google login returned no email");
  });

  await check("7. Tenant review feed loads", async () => {
    const res = await get("/venkateshwara/review");
    if (res.status !== 200) throw new Error(`GET /venkateshwara/review → ${res.status}`);
  });

  if (ALLOW_SIGNUP_WRITE) {
    await check("8. (optional) Unknown email → signup role", async () => {
      const probe = `smoke-${Date.now()}@e2e.local`;
      const res = await get("/api/portal_auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "google", email: probe }),
      });
      if (res.status !== 200) throw new Error(`POST google mode (unknown) → ${res.status}`);
      const body = await res.json();
      if (body.role !== "signup") throw new Error(`expected signup, got ${body.role}`);
    });
  } else {
    console.log("   (8. signup-write check skipped — set E2E_ALLOW_SIGNUP_WRITE=true to enable)");
  }

  console.log("");
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`  ✅ ${r.name}`);
    else {
      failed++;
      console.log(`  ❌ ${r.name} — ${r.detail}`);
    }
  }
  console.log("");
  console.log(failed === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed}/${results.length} CHECKS FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("e2e-smoke crashed:", e);
  process.exit(1);
});
