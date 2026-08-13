// apply_migration_017.js
// Applies supabase/migrations/017_client_tiers.sql via the Supabase POOLER.
// Usage: node scripts/apply_migration_017.js <production|staging>
//
// TAKE A BACKUP FIRST (node scripts/backup_production_db.js).
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const TARGETS = {
  production: {
    ref: "gumpmnbjdtzajhysnnaz",
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    password: "weRCL38blulCQHRd",
    restUrl: "https://gumpmnbjdtzajhysnnaz.supabase.co",
    serviceKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bXBtbmJqZHR6YWpoeXNubmF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE2MjY3OCwiZXhwIjoyMTAxNzM4Njc4fQ.LHhID51XFlSbZYfPvBaRh0COFfCTh3YzACiCzghBbFk",
  },
  staging: {
    ref: "effxrwrbsjduvhmorvrq",
    host: "aws-1-ap-south-1.pooler.supabase.com",
    password: "Aadisheshu1.",
    restUrl: "https://effxrwrbsjduvhmorvrq.supabase.co",
    serviceKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmZnhyd3Jic2pkdXZobW9ydnJxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDMzMjY4OCwiZXhwIjoyMDk1OTA4Njg4fQ.-zIIoXhuk_hcfJhIpFaih7XxRyo_ZKoa8Doxtil7B4k",
  },
};

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  console.log(`  ${ok ? "PASS" : "FAIL"}: ${label}${extra ? " -> " + extra : ""}`);
  ok ? pass++ : fail++;
}

async function main() {
  const target = process.argv[2];
  if (!TARGETS[target]) {
    console.error("Usage: node scripts/apply_migration_017.js <production|staging>");
    process.exit(1);
  }
  const cfg = TARGETS[target];

  // ===== FILE CHECK (ASCII, no BOM) =====
  const file = path.join(__dirname, "..", "supabase", "migrations", "017_client_tiers.sql");
  const buf = fs.readFileSync(file);
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const nonAscii = buf.filter((b) => b > 126).length;
  console.log(`\n=== FILE CHECK: 017_client_tiers.sql ===`);
  check("no UTF-8 BOM", !hasBom);
  check("pure ASCII", nonAscii === 0, `non-ascii bytes=${nonAscii}`);
  if (hasBom || nonAscii > 0) {
    console.error("Refusing to apply a non-ASCII / BOM file.");
    process.exit(1);
  }
  const sql = buf.toString("utf8");

  // ===== CONNECT =====
  const base = {
    host: cfg.host,
    port: 5432,
    user: `postgres.${cfg.ref}`,
    password: cfg.password,
    database: "postgres",
    connectionTimeoutMillis: 20000,
  };
  let client = null;
  for (const ssl of [{ rejectUnauthorized: false }, undefined]) {
    const candidate = new Client(ssl ? { ...base, ssl } : base);
    try {
      await candidate.connect();
      client = candidate;
      console.log(
        `\nCONNECTED [${target}]: ${cfg.host} as postgres.${cfg.ref} (ssl=${ssl ? "rejectUnauthorized:false" : "default"})`
      );
      break;
    } catch (e) {
      console.log(`  connect attempt (ssl=${ssl ? "explicit" : "default"}) failed: ${e.message}`);
      try { await candidate.end(); } catch (_) {}
    }
  }
  if (!client) throw new Error("Could not connect to the pooler with either SSL mode.");

  // ===== PRE-FLIGHT =====
  const preCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='tier'
  `);
  console.log(`clients.tier exists BEFORE: ${preCols.rows.length > 0}`);

  const preTable = await client.query(`
    SELECT 1 FROM pg_class WHERE oid = 'public.tier_activations'::regclass
  `);
  console.log(`tier_activations table exists BEFORE: ${preTable.rows.length > 0}`);

  // ===== APPLY =====
  console.log("\n=== APPLYING 017_client_tiers.sql ===");
  await client.query(sql);
  console.log("017 applied");

  // ===== VERIFY 1: columns exist on clients =====
  console.log("\n=== 1. COLUMNS ON clients ===");
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name IN ('tier', 'tier_activated_at', 'payment_ref', 'activated_by')
    ORDER BY ordinal_position
  `);
  const colNames = cols.rows.map((r) => r.column_name);
  for (const c of ["tier", "tier_activated_at", "payment_ref", "activated_by"]) {
    check(`clients.${c} exists`, colNames.includes(c));
  }
  // tier must be nullable with NO default (grandfathering safety)
  const tierCol = cols.rows.find((r) => r.column_name === "tier");
  check("clients.tier is nullable", tierCol && tierCol.is_nullable === "YES");
  check("clients.tier has NO default", tierCol && tierCol.column_default === null,
    `default=${tierCol && tierCol.column_default}`);

  // ===== VERIFY 2: CHECK constraint =====
  console.log("\n=== 2. CHECK CONSTRAINT ===");
  const chk = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'clients_tier_chk' AND conrelid = 'public.clients'::regclass
  `);
  check("clients_tier_chk constraint exists", chk.rows.length === 1,
    chk.rows[0] && chk.rows[0].def);
  if (chk.rows.length === 1) {
    const def = chk.rows[0].def;
    check("CHECK allows NULL", /tier IS NULL/.test(def));
    check("CHECK allows 'final'", /'final'/.test(def));
    check("CHECK allows 'base'", /'base'/.test(def));
    check("CHECK does NOT have a DEFAULT", !/DEFAULT/.test(def));
  }

  // ===== VERIFY 3: tier_activations table =====
  console.log("\n=== 3. tier_activations TABLE ===");
  const tbl = await client.query(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE oid = 'public.tier_activations'::regclass
  `);
  check("tier_activations table exists", tbl.rows.length === 1);
  if (tbl.rows.length === 1) {
    check("RLS enabled on tier_activations", tbl.rows[0].relrowsecurity === true);
  }

  const tblCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tier_activations'
    ORDER BY ordinal_position
  `);
  const tblColNames = tblCols.rows.map((r) => r.column_name);
  for (const c of ["id", "client_id", "from_tier", "to_tier", "payment_ref", "amount", "activated_by", "note", "created_at"]) {
    check(`tier_activations.${c} exists`, tblColNames.includes(c));
  }

  // ===== VERIFY 4: indexes on tier_activations =====
  console.log("\n=== 4. INDEXES ===");
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='tier_activations'
  `);
  const idxNames = idx.rows.map((r) => r.indexname);
  check("tier_activations_client_created_idx exists", idxNames.some((n) => n.includes("tier_activations_client_created")));
  check("tier_activations_payment_ref_uniq exists", idxNames.some((n) => n.includes("tier_activations_payment_ref_uniq")));

  // ===== VERIFY 5: policy =====
  console.log("\n=== 5. POLICIES ===");
  const pol = await client.query(`
    SELECT policyname, cmd, qual FROM pg_policies
    WHERE schemaname='public' AND tablename='tier_activations'
  `);
  const polNames = pol.rows.map((r) => r.policyname);
  check("service_role full access policy exists",
    polNames.includes("Allow service_role full access on tier_activations"));
  const anonPol = pol.rows.filter((r) => r.qual && /auth.role\(\)\s*=\s*'anon'/i.test(r.qual));
  check("NO anon policy on tier_activations", anonPol.length === 0);

  // ===== VERIFY 6: backfill — existing clients have tier='final' =====
  console.log("\n=== 6. BACKFILL (existing clients -> 'final') ===");
  const nullTier = await client.query(`
    SELECT count(*)::int AS n FROM public.clients WHERE tier IS NULL
  `);
  check("no clients with tier IS NULL", nullTier.rows[0].n === 0, `null_count=${nullTier.rows[0].n}`);

  const finalCount = await client.query(`
    SELECT count(*)::int AS n FROM public.clients WHERE tier = 'final'
  `);
  const totalCount = await client.query(`
    SELECT count(*)::int AS n FROM public.clients
  `);
  check("all clients have tier = 'final'",
    finalCount.rows[0].n === totalCount.rows[0].n && totalCount.rows[0].n > 0,
    `final=${finalCount.rows[0].n} total=${totalCount.rows[0].n}`);

  const activated = await client.query(`
    SELECT count(*)::int AS n FROM public.clients
    WHERE tier_activated_at IS NOT NULL AND activated_by = 'migration_014_grandfathered'
  `);
  check("existing clients have tier_activated_at set", activated.rows[0].n === totalCount.rows[0].n,
    `activated_count=${activated.rows[0].n}`);

  // ===== VERIFY 7: audit trail seeded =====
  console.log("\n=== 7. AUDIT TRAIL (tier_activations seeded) ===");
  const auditCount = await client.query(`
    SELECT count(*)::int AS n FROM public.tier_activations
    WHERE activated_by = 'migration_014_grandfathered' AND to_tier = 'final'
  `);
  check("grandfathering audit records exist", auditCount.rows[0].n === totalCount.rows[0].n,
    `audit_count=${auditCount.rows[0].n} total_clients=${totalCount.rows[0].n}`);

  // ===== VERIFY 8: tier_activations accessible via REST =====
  console.log("\n=== 8. REST API (PostgREST) ===");
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
  };
  let restOk = false;
  let restStatus = 0;
  let restBody = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${cfg.restUrl}/rest/v1/tier_activations?select=client_id,to_tier&limit=1`, {
      headers,
    });
    restStatus = res.status;
    restBody = await res.text();
    if (res.status >= 200 && res.status < 300) {
      restOk = true;
      break;
    }
    console.log(`  attempt ${attempt}: HTTP ${restStatus} ${restBody.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  check("REST tier_activations readable (2xx)", restOk, `HTTP ${restStatus} ${restBody.slice(0, 200)}`);

  await client.end();

  console.log(`\n=== SUMMARY [${target}]: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
