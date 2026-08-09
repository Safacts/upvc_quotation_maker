// backfill_customer_id.js
// Links quotations.customer_id to customers table via deterministic name matching.
// Uses row_number() to break ties when multiple customers share a name.
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

// Accept target as CLI arg: node backfill_customer_id.js [production|staging]
const target = process.argv[2] || 'production';
const CONFIG = DB[target];
if (!CONFIG) {
  console.error(`Unknown target: ${target}. Use 'production' or 'staging'.`);
  process.exit(1);
}
console.log(`Target: ${target} (${CONFIG.host})`);

async function main() {
  const c = new Client(CONFIG);
  await c.connect();
  await c.query("SET statement_timeout='30s'");

  console.log('\n' + '='.repeat(60));
  console.log('  BACKFILL: quotations.customer_id linking');
  console.log('='.repeat(60));

  // ── Dry run: show what WOULD be linked ──
  console.log('\n--- Dry run: linkable quotations ---');
  const dryRun = await c.query(`
    WITH matches AS (
      SELECT
        q.id AS q_id,
        q.quote_no,
        q.client_id AS q_client,
        q.customer_name,
        c.id AS c_id,
        c.name AS c_name,
        c.client_id AS c_client,
        ROW_NUMBER() OVER (
          PARTITION BY q.id
          ORDER BY
            CASE WHEN c.phone = q.contact_no AND c.phone <> '' THEN 0 ELSE 1 END,
            c.created_at,
            c.id
        ) AS rn
      FROM quotations q
      JOIN customers c
        ON lower(trim(q.customer_name)) = lower(trim(c.name))
        AND q.client_id = c.client_id
      WHERE trim(q.customer_name) <> ''
    )
    SELECT * FROM matches WHERE rn = 1
    ORDER BY q_client, customer_name
  `);

  console.log(`  Linkable quotations: ${dryRun.rows.length}`);
  for (const r of dryRun.rows) {
    console.log(`    [${r.q_client}] ${r.quote_no} -> "${r.customer_name}" (customer: ${r.c_id})`);
  }

  // ── Show ambiguous ones (multiple matches) ──
  const ambiguous = await c.query(`
    SELECT q.id, q.quote_no, q.customer_name, q.client_id, COUNT(*) AS match_count
    FROM quotations q
    JOIN customers c
      ON lower(trim(q.customer_name)) = lower(trim(c.name))
      AND q.client_id = c.client_id
    WHERE trim(q.customer_name) <> ''
    GROUP BY q.id, q.quote_no, q.customer_name, q.client_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);
  if (ambiguous.rows.length > 0) {
    console.log(`\n  ⚠ Ambiguous (multiple matches — will pick best by phone/date/id):`);
    for (const r of ambiguous.rows) {
      console.log(`    [${r.client_id}] ${r.quote_no} "${r.customer_name}" matches ${r.match_count} customers`);
    }
  }

  // ── Show unlinkable ──
  const unlinkable = await c.query(`
    SELECT COUNT(*) FROM quotations WHERE trim(coalesce(customer_name, '')) = ''
  `);
  console.log(`\n  Unlinkable (empty customer_name): ${unlinkable.rows[0].count}`);

  const unlinkableNoMatch = await c.query(`
    SELECT COUNT(*) FROM quotations q
    WHERE trim(coalesce(q.customer_name, '')) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM customers c
      WHERE lower(trim(q.customer_name)) = lower(trim(c.name))
      AND q.client_id = c.client_id
    )
  `);
  console.log(`  Unlinkable (no name match): ${unlinkableNoMatch.rows[0].count}`);

  // ── Apply the link ──
  console.log('\n--- Applying link ---');
  const result = await c.query(`
    WITH best_match AS (
      SELECT
        q.id AS q_id,
        c.id AS c_id,
        ROW_NUMBER() OVER (
          PARTITION BY q.id
          ORDER BY
            CASE WHEN c.phone = q.contact_no AND c.phone <> '' THEN 0 ELSE 1 END,
            c.created_at,
            c.id
        ) AS rn
      FROM quotations q
      JOIN customers c
        ON lower(trim(q.customer_name)) = lower(trim(c.name))
        AND q.client_id = c.client_id
      WHERE trim(q.customer_name) <> ''
    )
    UPDATE quotations q
    SET customer_id = bm.c_id
    FROM best_match bm
    WHERE q.id = bm.q_id AND bm.rn = 1
    AND q.customer_id IS DISTINCT FROM bm.c_id
  `);

  console.log(`  Rows updated: ${result.rowCount}`);

  // ── Verify ──
  const verify = await c.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(customer_id) AS linked,
      COUNT(*) - COUNT(customer_id) AS unlinked
    FROM quotations
  `);
  console.log(`\n  Result: ${verify.rows[0].linked}/${verify.rows[0].total} linked, ${verify.rows[0].unlinked} unlinked`);

  // ── Verify determinism: re-run dry run and check no changes needed ──
  const verify2 = await c.query(`
    WITH best_match AS (
      SELECT
        q.id AS q_id,
        c.id AS c_id,
        ROW_NUMBER() OVER (
          PARTITION BY q.id
          ORDER BY
            CASE WHEN c.phone = q.contact_no AND c.phone <> '' THEN 0 ELSE 1 END,
            c.created_at,
            c.id
        ) AS rn
      FROM quotations q
      JOIN customers c
        ON lower(trim(q.customer_name)) = lower(trim(c.name))
        AND q.client_id = c.client_id
      WHERE trim(q.customer_name) <> ''
    )
    SELECT COUNT(*) AS still_unlinked
    FROM quotations q
    LEFT JOIN best_match bm ON bm.q_id = q.id AND bm.rn = 1
    WHERE bm.c_id IS NOT NULL AND q.customer_id IS DISTINCT FROM bm.c_id
  `);
  console.log(`  Determinism check — rows that would change on re-run: ${verify2.rows[0].still_unlinked}`);

  await c.end();
  console.log('\n✅ BACKFILL COMPLETE');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
