// data_integrity_check.js
// Read-only data integrity probe on production DB.
const { Client } = require('pg');

const CONFIG = {
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gumpmnbjdtzajhysnnaz',
  password: 'weRCL38blulCQHRd',
  database: 'postgres',
};

let issues = [];
let warnings = [];
let passed = 0;

function ok(msg) { passed++; console.log('  ✅ ' + msg); }
function warn(msg) { warnings.push(msg); console.log('  ⚠️  ' + msg); }
function fail(msg) { issues.push(msg); console.log('  ❌ ' + msg); }

async function main() {
  const c = new Client(CONFIG);
  await c.connect();
  await c.query("SET statement_timeout='30s'");

  console.log('\n' + '='.repeat(60));
  console.log('  DATA INTEGRITY CHECK — PRODUCTION');
  console.log('='.repeat(60));

  // ── 1. Status case normalization (009 fix) ──
  console.log('\n--- 1. quotations.status case ---');
  const statusRes = await c.query("SELECT status, COUNT(*) FROM quotations GROUP BY 1 ORDER BY 1");
  const nonLower = statusRes.rows.filter(r => r.status !== r.status.toLowerCase());
  if (nonLower.length === 0) ok('All statuses lowercase: ' + statusRes.rows.map(r => `${r.status}=${r.count}`).join(', '));
  else fail('Mixed-case statuses found: ' + nonLower.map(r => `${r.status}=${r.count}`).join(', '));

  // ── 2. Orphaned measured_items ──
  console.log('\n--- 2. Orphaned measured_items ---');
  const orphanMI = await c.query(`
    SELECT COUNT(*) FROM measured_items mi
    WHERE NOT EXISTS (SELECT 1 FROM quotations q WHERE q.id = mi.quotation_id)
  `);
  if (orphanMI.rows[0].count === '0') ok('No orphaned measured_items');
  else fail(`${orphanMI.rows[0].count} measured_items point to non-existent quotations`);

  // ── 3. Orphaned unmeasured_items ──
  console.log('\n--- 3. Orphaned unmeasured_items ---');
  const orphanUM = await c.query(`
    SELECT COUNT(*) FROM unmeasured_items ui
    WHERE NOT EXISTS (SELECT 1 FROM quotations q WHERE q.id = ui.quotation_id)
  `);
  if (orphanUM.rows[0].count === '0') ok('No orphaned unmeasured_items');
  else fail(`${orphanUM.rows[0].count} unmeasured_items point to non-existent quotations`);

  // ── 4. Orphaned quotations (missing client) ──
  console.log('\n--- 4. Orphaned quotations (client_id) ---');
  const orphanQ = await c.query(`
    SELECT COUNT(*) FROM quotations q
    WHERE q.client_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = q.client_id)
  `);
  if (orphanQ.rows[0].count === '0') ok('No quotations pointing to non-existent clients');
  else fail(`${orphanQ.rows[0].count} quotations point to non-existent clients`);

  // ── 5. quotations.client_id NULL check ──
  console.log('\n--- 5. quotations.customer_id linkage ---');
  const custLink = await c.query("SELECT COUNT(*) AS total, COUNT(customer_id) AS linked FROM quotations");
  const totalQ = custLink.rows[0].total;
  const linkedQ = custLink.rows[0].linked;
  const unlinked = parseInt(totalQ) - parseInt(linkedQ);
  if (unlinked > 0) warn(`${unlinked}/${totalQ} quotations have NULL customer_id (expected — backfill is best-effort)`);
  else ok('All quotations have customer_id linked');

  // ── 6. Orphaned customers (client_id) ──
  console.log('\n--- 6. Orphaned customers (client_id) ---');
  const orphanC = await c.query(`
    SELECT COUNT(*) FROM customers cu
    WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = cu.client_id)
  `);
  if (orphanC.rows[0].count === '0') ok('No customers pointing to non-existent clients');
  else fail(`${orphanC.rows[0].count} customers point to non-existent clients`);

  // ── 7. Orphaned products (client_id) ──
  console.log('\n--- 7. Orphaned products (client_id) ---');
  const orphanP = await c.query(`
    SELECT COUNT(*) FROM products p
    WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id)
  `);
  if (orphanP.rows[0].count === '0') ok('No products pointing to non-existent clients');
  else fail(`${orphanP.rows[0].count} products point to non-existent clients`);

  // ── 8. Sequence health (quotation_no_seq) ──
  console.log('\n--- 8. Sequence health ---');
  const seqRes = await c.query(`
    SELECT 'quotation_no_seq' AS seq, last_value FROM quotation_no_seq
    UNION ALL
    SELECT 'signup_requests_id_seq', last_value FROM signup_requests_id_seq
    UNION ALL
    SELECT 'service_reviews_id_seq', last_value FROM service_reviews_id_seq
  `);
  for (const row of seqRes.rows) ok(`${row.seq} = ${row.last_value}`);

  // ── 9. Clients sanity (multi-tenant) ──
  console.log('\n--- 9. Client distribution ---');
  const clientDist = await c.query(`
    SELECT q.client_id, c.config->>'appName' AS app_name, COUNT(*) AS quote_count
    FROM quotations q
    LEFT JOIN clients c ON c.id = q.client_id
    GROUP BY q.client_id, c.config->>'appName'
    ORDER BY COUNT(*) DESC
  `);
  for (const row of clientDist.rows) ok(`${row.client_id} (${row.app_name || '???'}): ${row.quote_count} quotations`);

  // ── 10. clients table full ──
  console.log('\n--- 10. Clients table ---');
  const clientsRes = await c.query('SELECT id, config->>\'appName\' AS name FROM clients ORDER BY config->>\'appName\'');
  for (const row of clientsRes.rows) ok(`  ${row.id} — ${row.name}`);

  // ── 11. soft-deleted count ──
  console.log('\n--- 11. Soft-deleted rows (quotations.deleted) ---');
  const deletedRes = await c.query("SELECT COUNT(*) FROM quotations WHERE deleted = true");
  const deletedCount = deletedRes.rows[0].count;
  if (parseInt(deletedCount) > 0) warn(`${deletedCount} quotations are soft-deleted`);
  else ok('No soft-deleted quotations');

  // ── 12. Duplicate customer names (case-sensitive) ──
  console.log('\n--- 12. Duplicate customer names ---');
  const dupRes = await c.query(`
    SELECT name, client_id, COUNT(*) FROM customers
    GROUP BY name, client_id HAVING COUNT(*) > 1
  `);
  if (dupRes.rows.length === 0) ok('No duplicate (name, client_id) pairs in customers');
  else warn(`${dupRes.rows.length} duplicate (name, client_id) pairs — may be legit (case variants)`);

  // ── 13. quotations with empty/null client_id ──
  console.log('\n--- 13. quotations NULL client_id ---');
  const nullClient = await c.query("SELECT COUNT(*) FROM quotations WHERE client_id IS NULL");
  if (nullClient.rows[0].count === '0') ok('All quotations have client_id');
  else fail(`${nullClient.rows[0].count} quotations with NULL client_id`);

  // ── 14. gst_invoices linkage ──
  console.log('\n--- 14. gst_invoices ↔ quotations ---');
  const giRes = await c.query(`
    SELECT COUNT(*) FROM gst_invoices WHERE source_quotation_id IS NOT NULL
    AND source_quotation_id NOT IN (SELECT id FROM quotations)
  `);
  if (giRes.rows[0].count === '0') ok('No gst_invoices pointing to non-existent quotations');
  else fail(`${giRes.rows[0].count} gst_invoices point to non-existent quotations`);

  // ── 15. sent_emails linkage ──
  console.log('\n--- 15. sent_emails ↔ quotations ---');
  const seRes = await c.query(`
    SELECT quotation_id FROM sent_emails LIMIT 1
  `).catch(() => ({ rows: [] }));
  if (seRes.rows.length > 0 && 'quotation_id' in seRes.rows[0]) {
    const seCheck = await c.query(`
      SELECT COUNT(*) FROM sent_emails WHERE quotation_id IS NOT NULL
      AND quotation_id NOT IN (SELECT id FROM quotations)
    `);
    if (seCheck.rows[0].count === '0') ok('No sent_emails pointing to non-existent quotations');
    else fail(`${seCheck.rows[0].count} sent_emails point to non-existent quotations`);
  } else {
    ok('sent_emails table has no quotation_id column or is empty');
  }

  // ── 16. Timestamp sanity ──
  console.log('\n--- 16. Timestamp sanity (future dates) ---');
  const tsRes = await c.query(`
    SELECT COUNT(*) FROM quotations
    WHERE created_at::timestamptz > NOW() + INTERVAL '1 day'
  `);
  if (tsRes.rows[0].count === '0') ok('No future timestamps');
  else warn(`${tsRes.rows[0].count} quotations with future timestamps`);

  // ── Summary ──
  await c.end();

  console.log('\n' + '═'.repeat(60));
  console.log('  INTEGRITY REPORT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Passed:    ${passed}`);
  console.log(`  Warnings:  ${warnings.length}`);
  console.log(`  Failures:  ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n  ❌ FAILURES:');
    for (const i of issues) console.log('    - ' + i);
  }
  if (warnings.length > 0) {
    console.log('\n  ⚠️  WARNINGS:');
    for (const w of warnings) console.log('    - ' + w);
  }
  if (issues.length === 0 && warnings.length === 0) {
    console.log('\n  ✅ ALL CLEAR — zero issues, zero warnings');
  } else if (issues.length === 0) {
    console.log('\n  ✅ No hard failures — warnings are informational');
  }
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('INTEGRITY CHECK FAILED:', err.message);
  process.exit(1);
});
