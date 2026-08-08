#!/usr/bin/env node
// Syncs clients.config.portalPasswordHash from clients.password_hash.
// Requires `pg`: run `npm install pg` in the project root first.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = readFileSync(envPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .reduce((acc, line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});

const dbPassword = env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  console.error("SUPABASE_DB_PASSWORD not found in .env");
  process.exit(1);
}

const client = new pg.Client({
  host: "db.gumpmnbjdtzajhysnnaz.supabase.co",
  port: 5432,
  user: "postgres",
  database: "postgres",
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, password_hash, config->>'portalPasswordHash' AS cfg_hash FROM clients ORDER BY id;`,
    );
    const nullColumn = rows.filter((r) => r.password_hash === null);
    const toFix = rows.filter(
      (r) =>
        r.password_hash !== null &&
        (r.cfg_hash === null || r.cfg_hash !== r.password_hash),
    );

    for (const r of toFix) {
      await client.query(
        `UPDATE clients SET config = jsonb_set(config, '{portalPasswordHash}', to_jsonb($1::text))
         WHERE id = $2 AND (config->>'portalPasswordHash' IS NULL OR config->>'portalPasswordHash' <> $1::text);`,
        [r.password_hash, r.id],
      );
      console.log(`synced ${r.id}`);
    }

    const already = rows.length - toFix.length - nullColumn.length;
    console.log("");
    console.log(`clients scanned:  ${rows.length}`);
    console.log(`hashes synced:    ${toFix.length}`);
    console.log(`already in sync:  ${already}`);
    if (nullColumn.length > 0) {
      console.error(
        `WARNING: ${nullColumn.length} client(s) have a NULL password_hash column (decide manually): ${nullColumn.map((r) => r.id).join(", ")}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
