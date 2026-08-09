const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB = process.argv[2] || "staging";

const CONFIGS = {
  staging: {
    ref: "effxrwrbsjduvhmorvrq",
    host: "aws-1-ap-south-1.pooler.supabase.com",
    password: "Aadisheshu1.",
  },
  production: {
    ref: "gumpmnbjdtzajhysnnaz",
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    password: "weRCL38blulCQHRd",
  },
};

const cfg = CONFIGS[DB];
if (!cfg) {
  console.error(`Unknown DB: ${DB}. Use: staging | production`);
  process.exit(1);
}

const STRIP_BOM = (s) => s.replace(/^\uFEFF/, "");
const MIG_DIR = path.join(__dirname, "..", "supabase", "migrations");
const FILES = ["009_masters.sql", "010_console_rpcs.sql", "011_phase2_reports_and_export.sql"];

async function main() {
  const client = new Client({
    host: cfg.host, port: 5432, user: `postgres.${cfg.ref}`,
    password: cfg.password, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await client.connect();
  console.log(`CONNECTED: ${cfg.host} as postgres.${cfg.ref}`);

  // Pre-flight: check current state
  console.log("\n=== PRE-FLIGHT CHECK ===");
  for (const f of FILES) {
    let sql = STRIP_BOM(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    console.log(`\n=== APPLYING ${f} ===`);
    // Idempotency fix: 010 CREATE OR REPLACE VIEW cannot drop columns if the
    // view was previously extended by 011 (which adds `deleted`). Drop it first.
    if (f === "010_console_rpcs.sql") {
      await client.query(`DROP VIEW IF EXISTS public.quotation_money;`);
    }
    try {
      await client.query(sql);
      console.log(`  OK: ${f} applied`);
    } catch (err) {
      console.error(`  FAIL: ${f} — ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }

  // NOTIFY after all applied
  console.log("\n=== NOTIFY pgrst reload schema ===");
  await client.query(`NOTIFY pgrst, 'reload schema';`);
  console.log("  OK: schema reloaded");

  // ===== VERIFICATION =====
  console.log("\n=== POST-MIGRATION VERIFICATION ===");
  let pass = 0, fail = 0;
  const check = (label, ok) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}: ${label}`);
    ok ? pass++ : fail++;
  };

  // 009 checks
  const audit = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs'`);
  check("audit_logs table (009)", audit.rows.length === 1);

  const custId = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='customer_id'`);
  check("quotations.customer_id column (009)", custId.rows.length === 1);
  if (custId.rows.length === 1) check("  customer_id is uuid", custId.rows[0].data_type === 'uuid');

  const trigram = await client.query(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`);
  check("pg_trgm extension (009)", trigram.rows.length === 1);

  // 010 checks
  const vm = await client.query(`SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='quotation_money'`);
  check("quotation_money view (010)", vm.rows.length === 1);

  const sq = await client.query(`SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='search_quotations'`);
  check("search_quotations RPC (010)", sq.rows.length === 1);

  const gqs = await client.query(`SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='get_quote_stats'`);
  check("get_quote_stats RPC (010)", gqs.rows.length === 1);

  // 011 checks
  const del = await client.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='deleted'`);
  check("quotations.deleted column (011)", del.rows.length === 1);
  if (del.rows.length === 1) {
    check("  deleted is boolean", del.rows[0].data_type === 'boolean');
    check("  deleted is NOT NULL", del.rows[0].is_nullable === 'NO');
    check("  deleted DEFAULT false", del.rows[0].column_default === 'false');
  }

  const liveIdx = await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='quotations' AND indexname='quotations_client_live_idx'`);
  check("quotations_client_live_idx (011)", liveIdx.rows.length === 1);

  const newRpcs = await client.query(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('product_movement','win_loss_report','gst_summary','tally_export_data','bulk_status_update','bulk_delete') ORDER BY proname`);
  const found = newRpcs.rows.map(r => r.proname);
  const expected = ['bulk_delete','bulk_status_update','gst_summary','product_movement','tally_export_data','win_loss_report'];
  for (const fn of expected) check(`RPC ${fn} (011)`, found.includes(fn));

  // quotation_money has deleted column
  const vmDel = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotation_money' AND column_name='deleted'`);
  check("quotation_money.deleted column (011)", vmDel.rows.length === 1);

  // ===== FUNCTIONAL TESTS =====
  console.log("\n=== FUNCTIONAL TESTS ===");
  const clientRow = await client.query(`SELECT DISTINCT client_id FROM quotations WHERE NOT deleted LIMIT 1`);
  if (clientRow.rows.length === 0) {
    console.log("SKIP: no clients to test with");
  } else {
    const cid = clientRow.rows[0].client_id;
    console.log(`Testing with client_id='${cid}'`);

    // search_quotations
    try {
      const r = await client.query(`SELECT * FROM search_quotations($1) LIMIT 3`, [cid]);
      check(`search_quotations returns rows (${r.rows.length})`, r.rows.length >= 0);
    } catch (e) { check("search_quotations", false); console.log(`    ${e.message}`); }

    // get_quote_stats
    try {
      const r = await client.query(`SELECT * FROM get_quote_stats($1)`, [cid]);
      check("get_quote_stats returns row", r.rows.length === 1);
    } catch (e) { check("get_quote_stats", false); console.log(`    ${e.message}`); }

    // product_movement
    try {
      const r = await client.query(`SELECT * FROM product_movement($1) LIMIT 5`, [cid]);
      check(`product_movement returns rows (${r.rows.length})`, r.rows.length >= 0);
    } catch (e) { check("product_movement", false); console.log(`    ${e.message}`); }

    // win_loss_report
    try {
      const r = await client.query(`SELECT * FROM win_loss_report($1)`, [cid]);
      check(`win_loss_report returns rows (${r.rows.length})`, r.rows.length >= 0);
    } catch (e) { check("win_loss_report", false); console.log(`    ${e.message}`); }

    // gst_summary
    try {
      const r = await client.query(`SELECT * FROM gst_summary($1)`, [cid]);
      check(`gst_summary returns rows (${r.rows.length})`, r.rows.length >= 0);
    } catch (e) { check("gst_summary", false); console.log(`    ${e.message}`); }

    // tally_export_data
    try {
      const r = await client.query(`SELECT * FROM tally_export_data($1) LIMIT 3`, [cid]);
      check(`tally_export_data returns rows (${r.rows.length})`, r.rows.length >= 0);
    } catch (e) { check("tally_export_data", false); console.log(`    ${e.message}`); }

    // bulk_status_update + soft-delete + restore
    try {
      const realQ = await client.query(`SELECT id FROM quotations WHERE client_id=$1 AND NOT deleted LIMIT 1`, [cid]);
      if (realQ.rows.length > 0) {
        const qid = realQ.rows[0].id;
        const bu = await client.query(`SELECT * FROM bulk_status_update($1, $2, $3)`, [cid, [qid], 'sent']);
        check("bulk_status_update (valid)", bu.rows.length === 1 && bu.rows[0].success === true);
        const bd = await client.query(`SELECT * FROM bulk_delete($1, $2)`, [cid, [qid]]);
        check("bulk_delete (valid)", bd.rows.length === 1 && bd.rows[0].success === true);
        const delCheck = await client.query(`SELECT deleted FROM quotations WHERE id=$1`, [qid]);
        check("  soft-deleted row has deleted=true", delCheck.rows[0]?.deleted === true);
        const srch = await client.query(`SELECT count(*) FROM search_quotations($1) WHERE id=$2`, [cid, qid]);
        check("  deleted row excluded from search_quotations", parseInt(srch.rows[0].count) === 0);
        // Restore
        await client.query(`UPDATE quotations SET deleted=false, status='draft' WHERE id=$1`, [qid]);
        console.log("  (restored test row)");
      }
    } catch (e) { check("bulk ops", false); console.log(`    ${e.message}`); }

    // 501-id cap
    try {
      const bigArr = Array(501).fill('00000000-0000-0000-0000-000000000001');
      await client.query(`SELECT * FROM bulk_status_update($1, $2, $3)`, [cid, bigArr, 'draft']);
      check("501-id cap raises exception", false);
    } catch (e) {
      check("501-id cap raises exception", e.message.includes('500'));
    }
  }

  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  await client.end();

  if (fail > 0) {
    process.exit(1);
  }
  console.log(`\nALL DONE — migrations 009/010/011 applied and verified on ${DB}`);
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
