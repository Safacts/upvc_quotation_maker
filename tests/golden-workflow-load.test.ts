import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const script = "scripts/load-golden-workflow.mjs";
const run = (...args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

describe("golden workflow load simulation", () => {
  it("passes deterministic concurrent golden-path samples", () => {
    const result = run("--users=5", "--iterations=2", "--seed=7", "--json");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.summary.mode).toBe("offline-simulation");
    expect(report.summary.samples).toBe(10);
    expect(report.summary.failures).toBe(0);
    expect(report.summary.latencyMs.p95).toBeGreaterThan(0);
  });

  it("fails the gate when an explicit workflow failure is injected", () => {
    const result = run("--users=2", "--iterations=1", "--fail-step=render-pdf", "--json");
    expect(result.status).not.toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.summary.failures).toBe(2);
    expect(report.summary.passed).toBe(false);
  });
});
