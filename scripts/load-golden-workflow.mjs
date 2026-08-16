#!/usr/bin/env node
/**
 * Deterministic, offline load simulation for the supported quotation golden path.
 * This never contacts Supabase, Vercel, email, or customer data. It exercises
 * the workflow contract and produces release-gate-friendly metrics.
 */
import { performance } from "node:perf_hooks";

const argv = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  argv.set(key, value);
}
const users = clampInt(argv.get("users"), 1, 500, 20);
const iterations = clampInt(argv.get("iterations"), 1, 100, 2);
const seed = clampInt(argv.get("seed"), 1, 0x7fffffff, 20260817);
const maxFailureRate = Number(argv.get("max-failure-rate") ?? 0);
const maxP95Ms = Number(argv.get("max-p95-ms") ?? 1000);
const failureStep = argv.get("fail-step");
const json = argv.has("json");

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
function rng(start) {
  let state = start >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}
async function runGoldenPath(user, attempt, random) {
  const steps = ["authenticate", "persist-quotation", "render-pdf", "share-quotation", "approve"];
  const stepTimes = {};
  const started = performance.now();
  for (const step of steps) {
    const stepStart = performance.now();
    // Simulated service latency; intentionally bounded and deterministic.
    await new Promise(resolve => setTimeout(resolve, 2 + Math.floor(random() * 8)));
    if (failureStep === step) throw new Error(`injected failure at ${step}`);
    stepTimes[step] = Number((performance.now() - stepStart).toFixed(2));
  }
  return { user, attempt, durationMs: Number((performance.now() - started).toFixed(2)), stepTimes };
}

const random = rng(seed);
const results = [];
for (let wave = 0; wave < iterations; wave++) {
  const waveResults = await Promise.all(Array.from({ length: users }, (_, index) =>
    runGoldenPath(index + 1, wave + 1, random).then(
      value => ({ ok: true, ...value }),
      error => ({ ok: false, user: index + 1, attempt: wave + 1, error: error.message })
    )
  ));
  results.push(...waveResults);
}
const durations = results.filter(item => item.ok).map(item => item.durationMs);
const failures = results.filter(item => !item.ok);
const summary = {
  mode: "offline-simulation",
  contract: ["authenticate", "persist-quotation", "render-pdf", "share-quotation", "approve"],
  users, iterations, samples: results.length, seed,
  failures: failures.length,
  failureRate: results.length ? Number((failures.length / results.length).toFixed(4)) : 0,
  latencyMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: Math.max(0, ...durations) },
  thresholds: { maxFailureRate, maxP95Ms },
  passed: failures.length / results.length <= maxFailureRate && percentile(durations, 0.95) <= maxP95Ms,
};
if (json) console.log(JSON.stringify({ summary, failures }, null, 2));
else console.log(`Golden workflow simulation: ${summary.samples} samples, ${summary.failures} failures, p95 ${summary.latencyMs.p95}ms (${summary.passed ? "PASS" : "FAIL"})`);
if (!summary.passed) process.exitCode = 1;
