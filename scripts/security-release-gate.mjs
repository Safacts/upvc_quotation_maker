#!/usr/bin/env node
/** Security release gate. Runs local deterministic checks. */
import { spawnSync } from "node:child_process";

const rangeIndex = process.argv.indexOf("--range");
const range = rangeIndex >= 0 ? process.argv[rangeIndex + 1] : null;
const checks = [
  { name: "secret scan", command: "node", args: ["scripts/secret-scan.mjs", ...(range ? ["--range", range] : ["--staged"])] },
  { name: "adversarial tests", command: process.execPath, args: ["node_modules/vitest/vitest.mjs", "run", "tests/adversarial-tenant-rate-limit.test.ts"] },
  { name: "golden workflow load simulation", command: "node", args: ["scripts/load-golden-workflow.mjs", "--users=20", "--iterations=2", "--seed=20260817", "--max-failure-rate=0", "--max-p95-ms=1000"] },
];
const failures = [];
for (const check of checks) {
  console.log(`\n[security-gate] ${check.name}`);
  const command = check.command;
  const result = spawnSync(command, check.args, { stdio: "inherit" });
  if (result.error || result.status !== 0) failures.push(check.name);
}
if (failures.length) {
  console.error(`\nSecurity release gate FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nSecurity release gate PASSED: all checks are green.");

