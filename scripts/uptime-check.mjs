#!/usr/bin/env node
/**
 * Read-only external uptime probe for UptimeRobot, cron, or CI.
 *
 * Usage:
 *   UPTIME_BASE_URL=https://preview.example.vercel.app node scripts/uptime-check.mjs
 *   UPTIME_BASE_URL=https://app.vitharn.com UPTIME_WEBHOOK_URL=... node scripts/uptime-check.mjs
 *
 * The probe intentionally checks only public, non-mutating endpoints. It never
 * sends credentials or writes application data.
 */
const BASE = (process.env.UPTIME_BASE_URL || process.env.STAGING_BASE_URL || "https://app.vitharn.com").replace(/\/+$/, "");
const timeoutMs = Number(process.env.UPTIME_TIMEOUT_MS || 15000);
const webhook = process.env.UPTIME_WEBHOOK_URL || "";
const routes = (process.env.UPTIME_ROUTES || "/|200,/api/keepalive|200,/robots.txt|200,/sitemap.xml|200")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [path, expected = "200"] = entry.split("|");
    return { path, expected: new Set(expected.split(";").map(Number)) };
  });

const results = [];
async function probe(route) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}${route.path}`, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "vitharn-uptime-probe/1.0" },
      signal: controller.signal,
    });
    const result = { path: route.path, status: response.status, ms: Date.now() - started, ok: route.expected.has(response.status) };
    results.push(result);
    return result;
  } catch (error) {
    const result = { path: route.path, status: 0, ms: Date.now() - started, ok: false, error: error.name === "AbortError" ? "timeout" : error.message };
    results.push(result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function notify(payload) {
  if (!webhook) return;
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitharn-uptime-probe/1.0" },
    body: JSON.stringify(payload),
  });
}

const startedAt = new Date().toISOString();
await Promise.all(routes.map(probe));
const failed = results.filter((result) => !result.ok);
const payload = { service: "vitharn", baseUrl: BASE, checkedAt: startedAt, ok: failed.length === 0, results };
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.path} ${result.status || result.error} ${result.ms}ms`);
}
if (failed.length) {
  try { await notify(payload); } catch (error) { console.error(`Webhook notification failed: ${error.message}`); }
  process.exitCode = 1;
}
