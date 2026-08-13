// apply_migration_016.js
// Applies supabase/migrations/016_create_tenant_rpc.sql via the Supabase POOLER.
// Usage: node scripts/apply_migration_016.js <production|staging>
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

const TEST_ID = "__test_migration_016__";
const REST_TEST_ID = "__test_rest__";

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  console.log(`  ${ok ? "PASS" : "FAIL"}: ${label}${extra ? " -> " + extra : ""}`);
  ok ? pass++ : fail++;
}

async function main() {
  const target = process.argv[2];
  if (!TARGETS[target]) {
    console.error("Usage: node scripts/apply_migration_016.js <production|staging>");
    process.exit(1);
  }
  const cfg = TARGETS[target];

  const file = path.join(__dirname, "..", "supabase", "migrations", "016_create_tenant_rpc.sql");
  const buf = fs.readFileSync(file);
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const nonAscii = buf.filter((b) => b > 126).length;
  console.log(`\n=== FILE CHECK: 016_create_tenant_rpc.sql ===`);
  check("no UTF-8 BOM", !hasBom);
  check("pure ASCII", nonAscii === 0, `non-ascii bytes=${nonAscii}`);
  if (hasBom || nonAscii > 0) {
    console.error("Refusing to apply a non-ASCII / BOM file.");
    process.exit(1);
  }
  const sql = buf.toString("utf8");

  const base = {
    host: cfg.host,
    port: 5432,
    user: `postgres.${cfg.ref}`,
    password: cfg.password,
    database: "postgres",
    connectionTimeoutMillis: 20000,
  };
  // The pooler sometimes stalls the TLS handshake from this network; fall back to
  // the plain pooler connection (same pattern as scripts/backup_production_db.js).
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
  const pre = await client.query(
    `SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_tenant'`
  );
  console.log(`create_tenant exists BEFORE: ${pre.rows.length > 0}`);

  // ===== APPLY =====
  console.log("\n=== APPLYING 016_create_tenant_rpc.sql ===");
  await client.query(sql);
  console.log("016 applied");

  // ===== VERIFY 1: function exists / security type =====
  console.log("\n=== 1. FUNCTION EXISTS ===");
  const fn = await client.query(`
    SELECT r.routine_name, r.routine_type, r.security_type, p.prosecdef, p.provolatile,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM information_schema.routines r
    JOIN pg_proc p ON p.oid = (quote_ident(r.specific_schema)||'.'||r.routine_name||'('||
                               coalesce(pg_get_function_identity_arguments(p.oid),'')||')')::regprocedure
    WHERE r.routine_name = 'create_tenant' AND r.specific_schema='public';
  `).catch(async () => {
    return client.query(`
      SELECT routine_name, routine_type, security_type, NULL::boolean AS prosecdef,
             NULL::text AS provolatile, NULL::text AS args
      FROM information_schema.routines
      WHERE routine_name='create_tenant' AND specific_schema='public';
    `);
  });
  check("exactly 1 create_tenant routine", fn.rows.length === 1, JSON.stringify(fn.rows[0] || {}));
  if (fn.rows.length === 1) {
    check("security_type = INVOKER", fn.rows[0].security_type === "INVOKER");
    check("routine_type = FUNCTION", fn.rows[0].routine_type === "FUNCTION");
  }
  const sec = await client.query(
    `SELECT prosecdef, pg_get_function_identity_arguments(oid) AS args
     FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_tenant'`
  );
  check("pg_proc.prosecdef = false (INVOKER)", sec.rows[0] && sec.rows[0].prosecdef === false);
  check("signature = (text, jsonb)", sec.rows[0] && sec.rows[0].args === "p_client_id text, p_config jsonb");

  // ===== VERIFY 2: functional + idempotency =====
  console.log("\n=== 2. FUNCTIONAL + IDEMPOTENCY ===");
  await client.query(`DELETE FROM quotation_counters WHERE client_id = $1`, [TEST_ID]);
  await client.query(`DELETE FROM clients WHERE id = $1`, [TEST_ID]);

  await client.query(`SELECT create_tenant($1, $2::jsonb)`, [TEST_ID, '{"quotePrefix": "TEST"}']);
  const c1 = await client.query(`SELECT id, config, is_active FROM clients WHERE id = $1`, [TEST_ID]);
  check("clients row created", c1.rows.length === 1, JSON.stringify(c1.rows[0] || {}));
  check("config stored", c1.rows[0] && c1.rows[0].config && c1.rows[0].config.quotePrefix === "TEST");
  check("is_active = true", c1.rows[0] && c1.rows[0].is_active === true);

  // NOTE: the live column is next_val (bigint), NOT current_value (ticket spec was wrong).
  const q1 = await client.query(
    `SELECT client_id, next_val FROM quotation_counters WHERE client_id = $1`,
    [TEST_ID]
  );
  check("quotation_counters row seeded", q1.rows.length === 1, JSON.stringify(q1.rows[0] || {}));
  check("next_val = 0", q1.rows[0] && Number(q1.rows[0].next_val) === 0);

  // Re-call (idempotency)
  await client.query(`SELECT create_tenant($1, $2::jsonb)`, [TEST_ID, '{"quotePrefix": "TEST"}']);
  const cc = await client.query(`SELECT count(*)::int AS n FROM clients WHERE id = $1`, [TEST_ID]);
  const qc = await client.query(
    `SELECT count(*)::int AS n FROM quotation_counters WHERE client_id = $1`,
    [TEST_ID]
  );
  check("idempotent: clients count still 1", cc.rows[0].n === 1, `n=${cc.rows[0].n}`);
  check("idempotent: counters count still 1", qc.rows[0].n === 1, `n=${qc.rows[0].n}`);

  // Re-call with different config must NOT overwrite (ON CONFLICT DO NOTHING)
  await client.query(`SELECT create_tenant($1, $2::jsonb)`, [TEST_ID, '{"quotePrefix": "OTHER"}']);
  const cfg2 = await client.query(`SELECT config FROM clients WHERE id = $1`, [TEST_ID]);
  check(
    "re-call does NOT overwrite existing config",
    cfg2.rows[0] && cfg2.rows[0].config.quotePrefix === "TEST",
    JSON.stringify(cfg2.rows[0].config)
  );

  // Counter semantics: first issued quote number for a freshly created tenant must end -0001
  try {
    const qn = await client.query(`SELECT get_next_quote_number($1) AS n`, [TEST_ID]);
    check(
      "first get_next_quote_number ends -0001",
      typeof qn.rows[0].n === "string" && qn.rows[0].n.endsWith("-0001"),
      qn.rows[0].n
    );
  } catch (e) {
    check("first get_next_quote_number ends -0001", false, e.message);
  }

  // Default p_config
  await client.query(`DELETE FROM quotation_counters WHERE client_id = $1`, [TEST_ID + "_def"]);
  await client.query(`DELETE FROM clients WHERE id = $1`, [TEST_ID + "_def"]);
  await client.query(`SELECT create_tenant($1)`, [TEST_ID + "_def"]);
  const def = await client.query(`SELECT config FROM clients WHERE id = $1`, [TEST_ID + "_def"]);
  check("p_config defaults to {}", def.rows.length === 1 && JSON.stringify(def.rows[0].config) === "{}");
  await client.query(`DELETE FROM quotation_counters WHERE client_id = $1`, [TEST_ID + "_def"]);
  await client.query(`DELETE FROM clients WHERE id = $1`, [TEST_ID + "_def"]);

  // Cleanup main test tenant
  await client.query(`DELETE FROM quotation_counters WHERE client_id = $1`, [TEST_ID]);
  await client.query(`DELETE FROM clients WHERE id = $1`, [TEST_ID]);
  const after = await client.query(`SELECT count(*)::int AS n FROM clients WHERE id = $1`, [TEST_ID]);
  const afterQ = await client.query(
    `SELECT count(*)::int AS n FROM quotation_counters WHERE client_id = $1`,
    [TEST_ID]
  );
  check("cleanup: clients count 0", after.rows[0].n === 0);
  check("cleanup: counters count 0", afterQ.rows[0].n === 0);

  // ===== VERIFY 3: validation =====
  console.log("\n=== 3. VALIDATION (empty / blank / NULL must RAISE) ===");
  for (const [label, val] of [["empty string", ""], ["whitespace only", "   "], ["NULL", null]]) {
    // SAVEPOINT not needed: each statement is its own implicit txn here
    try {
      await client.query(`SELECT create_tenant($1::text, '{}'::jsonb)`, [val]);
      check(`rejects ${label}`, false, "no exception raised");
    } catch (e) {
      check(
        `rejects ${label}`,
        /must be a non-empty text value/.test(e.message),
        e.message
      );
    }
  }
  const leaked = await client.query(
    `SELECT count(*)::int AS n FROM clients WHERE id IN ('', '   ') OR id IS NULL`
  );
  check("no blank tenant rows leaked", leaked.rows[0].n === 0);

  // ===== VERIFY 4: grants =====
  console.log("\n=== 4. GRANTS ===");
  const grants = await client.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE routine_name = 'create_tenant' AND routine_schema = 'public';
  `);
  const g = grants.rows.filter((r) => r.privilege_type === "EXECUTE").map((r) => r.grantee);
  console.log(`  grantees: ${JSON.stringify(g)}`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    check(`${role} has EXECUTE`, g.includes(role));
  }

  await client.end();

  // ===== VERIFY 5: REST API =====
  console.log("\n=== 5. REST API (PostgREST) ===");
  const headers = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
  };
  // PostgREST schema cache may take a moment after NOTIFY
  let restOk = false;
  let restStatus = 0;
  let restBody = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${cfg.restUrl}/rest/v1/rpc/create_tenant`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_client_id: REST_TEST_ID, p_config: {} }),
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
  check("REST rpc/create_tenant returns 2xx", restOk, `HTTP ${restStatus} ${restBody.slice(0, 200)}`);

  // Verify + clean up the REST test tenant
  const verify = await fetch(
    `${cfg.restUrl}/rest/v1/clients?id=eq.${encodeURIComponent(REST_TEST_ID)}&select=id,is_active`,
    { headers }
  );
  const verifyRows = await verify.json();
  check("REST-created tenant visible", Array.isArray(verifyRows) && verifyRows.length === 1,
    JSON.stringify(verifyRows).slice(0, 200));

  const delCounter = await fetch(
    `${cfg.restUrl}/rest/v1/quotation_counters?client_id=eq.${encodeURIComponent(REST_TEST_ID)}`,
    { method: "DELETE", headers }
  );
  const delClient = await fetch(
    `${cfg.restUrl}/rest/v1/clients?id=eq.${encodeURIComponent(REST_TEST_ID)}`,
    { method: "DELETE", headers }
  );
  const recheck = await fetch(
    `${cfg.restUrl}/rest/v1/clients?id=eq.${encodeURIComponent(REST_TEST_ID)}&select=id`,
    { headers }
  );
  const recheckRows = await recheck.json();
  check(
    "REST cleanup done",
    delCounter.status < 300 && delClient.status < 300 && Array.isArray(recheckRows) && recheckRows.length === 0,
    `counters=${delCounter.status} clients=${delClient.status} remaining=${JSON.stringify(recheckRows).slice(0, 80)}`
  );

  console.log(`\n=== SUMMARY [${target}]: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
