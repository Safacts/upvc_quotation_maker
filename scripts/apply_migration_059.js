// apply_migration_059.js
// Applies supabase/migrations/059_quotation_is_interstate.sql via the pooler.
// Usage: node scripts/apply_migration_059.js <staging|production>
//
// Strictly additive (ADD COLUMN IF NOT EXISTS + NOTIFY). Passwords come from
// the repo .env and are NEVER printed. Follows scripts/apply_migration_017.js.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv(root) {
  const out = {};
  for (const f of [path.join(root, ".env")]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return out;
}

function refOf(url) {
  const m = String(url || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : "";
}

async function main() {
  const target = process.argv[2];
  if (target !== "staging" && target !== "production") {
    console.error("Usage: node scripts/apply_migration_059.js <staging|production>");
    process.exit(1);
  }
  const root = path.join(__dirname, "..");
  const env = loadEnv(root);
  const url = target === "staging" ? env.STAGING_SUPABASE_URL : env.SUPABASE_URL;
  // Pooler DB passwords live ONLY in the gitignored .env (POOLER_PW_*);
  // they are never printed, never committed. See C:\agents memory database.md.
  const password =
    target === "staging" ? env.POOLER_PW_STAGING : env.POOLER_PW_PROD;
  const port = target === "staging" ? 6543 : 5432;
  const ref = refOf(url);
  if (!ref || !password) {
    console.error(`Missing connection details for ${target} (ref or password empty).`);
    process.exit(1);
  }

  // ===== FILE CHECK (ASCII, no BOM) =====
  const file = path.join(root, "supabase", "migrations", "059_quotation_is_interstate.sql");
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.error("Refusing to apply a BOM file.");
    process.exit(1);
  }
  if (buf.filter((b) => b > 126).length > 0) {
    console.error("Refusing to apply a non-ASCII file.");
    process.exit(1);
  }
  const sql = buf.toString("utf8");

  // ===== CONNECT (pooler, Mumbai projects) =====
  const user = `postgres.${ref}`;
  let client = null;
  const host = "aws-0-ap-south-1.pooler.supabase.com";
  for (const ssl of [{ rejectUnauthorized: false }, true, undefined]) {
    const candidate = new Client({
      host,
      port,
      user,
      password,
      database: "postgres",
      connectionTimeoutMillis: 15000,
      ssl,
    });
    try {
      await candidate.connect();
      client = candidate;
      console.log(`CONNECTED [${target}]: ${host}:${port} as ${user}`);
      break;
    } catch (e) {
      console.log(`  connect ${host} failed: ${e.message}`);
      try { await candidate.end(); } catch (_) {}
    }
  }
  if (!client) {
    console.error(`Could not reach ${target} pooler.`);
    process.exit(1);
  }

  try {
    await client.query(sql);
    console.log("Migration SQL executed.");
    const check = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns " +
        "WHERE table_schema='public' AND table_name='quotations' AND column_name='is_interstate'",
    );
    if (check.rows.length === 1) {
      console.log(`VERIFIED [${target}]: public.quotations.is_interstate (${check.rows[0].data_type})`);
    } else {
      console.error(`VERIFICATION FAILED [${target}]: column not found after apply.`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
