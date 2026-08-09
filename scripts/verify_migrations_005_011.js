// verify_migrations_005_011.js
// Verifies that all migrations 005-011 are applied to both staging and production databases.
const { Client } = require('pg');

const DB = {
  production: {
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gumpmnbjdtzajhysnnaz',
    password: 'weRCL38blulCQHRd',
    database: 'postgres',
  },
  staging: {
    host: 'aws-1-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.effxrwrbsjduvhmorvrq',
    password: 'Aadisheshu1.',
    database: 'postgres',
  },
};

// ── Checks: each returns { name, pass: boolean, detail } ──

async function checkTable(client, table) {
  const r = await client.query(
    `SELECT to_regclass($1) AS exists`,
    [`public.${table}`]
  );
  return {
    name: `table:${table}`,
    pass: r.rows[0].exists !== null,
    detail: r.rows[0].exists ? 'exists' : 'MISSING',
  };
}

async function checkColumn(client, table, column, expectedType) {
  const r = await client.query(
    `SELECT data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  if (r.rows.length === 0) return { name: `column:${table}.${column}`, pass: false, detail: 'MISSING' };
  const row = r.rows[0];
  const ok = expectedType ? row.udt_name === expectedType || row.data_type === expectedType : true;
  return {
    name: `column:${table}.${column}`,
    pass: ok,
    detail: ok ? `${row.data_type}` : `type=${row.udt_name} expected=${expectedType}`,
  };
}

async function checkFunction(client, fnName) {
  const r = await client.query(
    `SELECT p.proname
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname=$1`,
    [fnName]
  );
  if (r.rows.length === 0) return { name: `function:${fnName}`, pass: false, detail: 'MISSING' };
  return { name: `function:${fnName}`, pass: true, detail: 'exists' };
}

async function checkView(client, viewName) {
  const r = await client.query(
    `SELECT to_regclass($1) AS exists`,
    [`public.${viewName}`]
  );
  return {
    name: `view:${viewName}`,
    pass: r.rows[0].exists !== null,
    detail: r.rows[0].exists ? 'exists' : 'MISSING',
  };
}

async function checkExtension(client, ext) {
  const r = await client.query(
    `SELECT 1 FROM pg_extension WHERE extname=$1`,
    [ext]
  );
  return {
    name: `extension:${ext}`,
    pass: r.rows.length > 0,
    detail: r.rows.length > 0 ? 'installed' : 'MISSING',
  };
}

async function checkPolicy(client, table, policyName) {
  const r = await client.query(
    `SELECT 1 FROM pg_policies WHERE tablename=$1 AND policyname=$2`,
    [table, policyName]
  );
  return {
    name: `policy:${table}.${policyName}`,
    pass: r.rows.length > 0,
    detail: r.rows.length > 0 ? 'exists' : 'MISSING',
  };
}

async function checkIndex(client, table, indexName) {
  const r = await client.query(
    `SELECT 1 FROM pg_indexes WHERE tablename=$1 AND indexname=$2`,
    [table, indexName]
  );
  return {
    name: `index:${indexName}`,
    pass: r.rows.length > 0,
    detail: r.rows.length > 0 ? 'exists' : 'MISSING',
  };
}

async function checkRLSEnabled(client, table) {
  const r = await client.query(
    `SELECT relrowsecurity FROM pg_class WHERE relname=$1 AND relnamespace='public'::regnamespace`,
    [table]
  );
  if (r.rows.length === 0) return { name: `rls:${table}`, pass: false, detail: 'TABLE NOT FOUND' };
  return {
    name: `rls:${table}`,
    pass: r.rows[0].relrowsecurity === true,
    detail: r.rows[0].relrowsecurity ? 'enabled' : 'DISABLED',
  };
}

async function checkTrigger(client, triggerName) {
  const r = await client.query(
    `SELECT 1 FROM pg_trigger WHERE tgname=$1`,
    [triggerName]
  );
  return {
    name: `trigger:${triggerName}`,
    pass: r.rows.length > 0,
    detail: r.rows.length > 0 ? 'exists' : 'MISSING',
  };
}

async function runChecksForDb(label, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  VERIFYING: ${label.toUpperCase()}`);
  console.log(`  Host: ${config.host}`);
  console.log('='.repeat(60));

  const client = new Client(config);
  await client.connect();

  // statement_timeout so a hung check doesn't block
  await client.query(`SET statement_timeout = '10s'`);

  const checks = [];

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 005 — vitharn_invoices
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 005: vitharn_invoices ---');
  checks.push(await checkTable(client, 'vitharn_invoices'));
  checks.push(await checkTable(client, 'vitharn_invoice_items'));
  checks.push(await checkTable(client, 'vitharn_invoice_counters'));
  checks.push(await checkColumn(client, 'vitharn_invoices', 'status', 'text'));
  checks.push(await checkColumn(client, 'vitharn_invoices', 'client_id', 'text'));
  checks.push(await checkColumn(client, 'vitharn_invoices', 'total', 'numeric'));
  checks.push(await checkFunction(client, 'get_next_vitharn_invoice_number'));
  checks.push(await checkRLSEnabled(client, 'vitharn_invoices'));
  checks.push(await checkRLSEnabled(client, 'vitharn_invoice_items'));
  checks.push(await checkRLSEnabled(client, 'vitharn_invoice_counters'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 006 — secure_quotations
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 006: secure_quotations (RLS) ---');
  checks.push(await checkRLSEnabled(client, 'quotations'));
  checks.push(await checkRLSEnabled(client, 'measured_items'));
  checks.push(await checkRLSEnabled(client, 'unmeasured_items'));
  checks.push(await checkPolicy(client, 'quotations', 'Allow service_role full access on quotations'));
  checks.push(await checkPolicy(client, 'quotations', 'client_isolation'));
  checks.push(await checkPolicy(client, 'measured_items', 'Allow service_role full access on measured_items'));
  checks.push(await checkPolicy(client, 'measured_items', 'client_isolation'));
  checks.push(await checkPolicy(client, 'unmeasured_items', 'Allow service_role full access on unmeasured_items'));
  checks.push(await checkPolicy(client, 'unmeasured_items', 'client_isolation'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 007 — customers
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 007: customers ---');
  checks.push(await checkTable(client, 'customers'));
  checks.push(await checkColumn(client, 'customers', 'name', 'text'));
  checks.push(await checkColumn(client, 'customers', 'phone', 'text'));
  checks.push(await checkColumn(client, 'customers', 'email', 'text'));
  checks.push(await checkColumn(client, 'customers', 'soft_deleted', 'bool'));
  checks.push(await checkColumn(client, 'customers', 'client_id', 'text'));
  checks.push(await checkRLSEnabled(client, 'customers'));
  checks.push(await checkPolicy(client, 'customers', 'Allow public all on customers'));
  checks.push(await checkTrigger(client, 'set_updated_at_customers'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 008 — products
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 008: products ---');
  checks.push(await checkTable(client, 'products'));
  checks.push(await checkColumn(client, 'products', 'name', 'text'));
  checks.push(await checkColumn(client, 'products', 'category', 'text'));
  checks.push(await checkColumn(client, 'products', 'price', 'numeric'));
  checks.push(await checkColumn(client, 'products', 'unit', 'text'));
  checks.push(await checkColumn(client, 'products', 'soft_deleted', 'bool'));
  checks.push(await checkRLSEnabled(client, 'products'));
  checks.push(await checkPolicy(client, 'products', 'Allow public all on products'));
  checks.push(await checkTrigger(client, 'set_updated_at_products'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 009 — masters (audit_logs, customer_id, pg_trgm, indexes, status normalize)
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 009: masters ---');
  checks.push(await checkTable(client, 'audit_logs'));
  checks.push(await checkColumn(client, 'audit_logs', 'action', 'text'));
  checks.push(await checkColumn(client, 'audit_logs', 'entity_type', 'text'));
  checks.push(await checkColumn(client, 'audit_logs', 'entity_id', 'text'));
  checks.push(await checkColumn(client, 'audit_logs', 'client_id', 'text'));
  checks.push(await checkColumn(client, 'quotations', 'customer_id', 'uuid'));
  checks.push(await checkExtension(client, 'pg_trgm'));
  checks.push(await checkIndex(client, 'quotations', 'quotations_client_status_idx'));
  checks.push(await checkIndex(client, 'quotations', 'quotations_customer_name_trgm_idx'));
  checks.push(await checkRLSEnabled(client, 'audit_logs'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 010 — console_rpcs (quotation_money, search_quotations, get_quote_stats)
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 010: console_rpcs ---');
  checks.push(await checkView(client, 'quotation_money'));
  checks.push(await checkFunction(client, 'search_quotations'));
  checks.push(await checkFunction(client, 'get_quote_stats'));

  // ═══════════════════════════════════════════════════════════
  // MIGRATION 011 — phase2_reports_and_export (deleted, RPCs, bulk ops)
  // ═══════════════════════════════════════════════════════════
  console.log('\n--- Migration 011: phase2_reports_and_export ---');
  checks.push(await checkColumn(client, 'quotations', 'deleted', 'bool'));
  checks.push(await checkFunction(client, 'product_movement'));
  checks.push(await checkFunction(client, 'win_loss_report'));
  checks.push(await checkFunction(client, 'gst_summary'));
  checks.push(await checkFunction(client, 'tally_export_data'));
  checks.push(await checkFunction(client, 'bulk_status_update'));
  checks.push(await checkFunction(client, 'bulk_delete'));
  checks.push(await checkIndex(client, 'quotations', 'quotations_client_live_idx'));

  await client.end();

  // ── Report ──
  const passed = checks.filter(c => c.pass);
  const failed = checks.filter(c => !c.pass);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  RESULT: ${passed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.log(`\n  ❌ FAILURES (${failed.length}):`);
    for (const f of failed) console.log(`     - ${f.name}: ${f.detail}`);
  } else {
    console.log(`\n  ✅ ALL CHECKS PASSED — migrations 005-011 fully applied`);
  }
  console.log('─'.repeat(60));

  return { label, passed: passed.length, failed: failed.length, failures: failed };
}

(async () => {
  try {
    const prod = await runChecksForDb('production', DB.production);
    const staging = await runChecksForDb('staging', DB.staging);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  FINAL VERDICT`);
    console.log('═'.repeat(60));
    console.log(`  Production (gumpmnbjdtzajhysnnaz): ${prod.passed} passed, ${prod.failed} failed`);
    console.log(`  Staging    (effxrwrbsjduvhmorvrq): ${staging.passed} passed, ${staging.failed} failed`);

    if (prod.failed === 0 && staging.failed === 0) {
      console.log(`\n  ✅ BOTH DATABASES IN SYNC — all migrations 005-011 applied`);
      process.exit(0);
    } else {
      console.log(`\n  ⚠️  DATABASES NOT IN SYNC — see failures above`);
      process.exit(1);
    }
  } catch (err) {
    console.error('FATAL:', err.message);
    process.exit(2);
  }
})();
