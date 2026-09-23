#!/usr/bin/env node

/**
 * Fail-closed Vercel cron schedule guard.
 *
 * Both Vercel teams for this repo (staging + production) are on the Hobby
 * plan, which accepts cron jobs that run AT MOST once per day. A denser
 * schedule (e.g. every-5-minutes) makes Vercel reject the ENTIRE deployment
 * with "Hobby accounts are limited to daily cron jobs" — this bit us on
 * 23-09-2026 and red-walled staging AND production until the cron was
 * relaxed to daily.
 *
 * Rule enforced here: minute and hour must each be a single fixed value
 * (daily, weekly, monthly — anything at most once a day). Step, range,
 * list, and star shorthand in either field are all rejected.
 * Need sub-daily cadence? Use a GitHub Actions `schedule` workflow that
 * curls the endpoint (free, no Vercel involvement) or upgrade to Pro —
 * do NOT densify vercel.json.
 *
 * Usage: node scripts/validate-vercel-crons.mjs [path-to-vercel.json]
 */

import { readFileSync } from "node:fs";

const configPath = process.argv[2] ?? "vercel.json";

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  throw new Error(`Cannot read/parse ${configPath}: ${e.message}`);
}

const crons = config.crons ?? [];
if (!Array.isArray(crons)) {
  throw new Error(`"${configPath}" has a non-array "crons" key`);
}

const isFixed = (field, max) => {
  if (!/^\d+$/.test(field)) return false;
  const n = Number(field);
  return n >= 0 && n <= max;
};

const failures = [];
for (const cron of crons) {
  const schedule = String(cron?.schedule ?? "");
  const path = String(cron?.path ?? "(unknown path)");
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    failures.push(`${path}: malformed schedule "${schedule}" (expected 5 fields)`);
    continue;
  }
  const [minute, hour] = parts;
  if (!isFixed(minute, 59) || !isFixed(hour, 23)) {
    failures.push(
      `${path}: schedule "${schedule}" runs more than once a day — ` +
        `Vercel Hobby rejects the whole deployment. ` +
        `Use a fixed minute+hour (e.g. "30 2 * * *"), ` +
        `a GitHub Actions schedule, or upgrade to Pro.`,
    );
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`::error::vercel.json cron guard: ${f}`);
  throw new Error(`${failures.length} Vercel cron schedule(s) violate the Hobby daily limit`);
}

console.log(
  crons.length === 0
    ? "vercel.json cron guard: no crons configured — OK"
    : `vercel.json cron guard: ${crons.length} cron(s) at most daily — OK`,
);
