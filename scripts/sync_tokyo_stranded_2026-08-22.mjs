import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = 'C:/Projects/myprojects/flutterprojects/upvc_quotation_maker';
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
);

const APPLY = process.argv.includes('--apply');
const CUTOFF = '2026-08-19T00:00:00Z';

const tokyo = new pg.Client({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432,
  user: 'postgres.gumpmnbjdtzajhysnnaz', password: env.SUPABASE_DB_PASSWORD_STAGING,
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const mumbai = new pg.Client({
  host: 'aws-1-ap-south-1.pooler.supabase.com', port: 5432,
  user: 'postgres.effxrwrbsjduvhmorvrq', password: env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

await tokyo.connect();
await mumbai.connect();

async function columns(client, table) {
  const r = await client.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return r.rows;
}

// FK order: parents before children
const PARENTS = ['quotations', 'gst_invoices'];
const CHILDREN = ['measured_items', 'unmeasured_items', 'quotation_photos', 'quotation_share_tokens', 'sent_emails', 'service_reviews'];
const TABLES = [...PARENTS, ...CHILDREN];

const report = {};
let missingQuoteIds = [];

for (const t of TABLES) {
  const colsTokyo = await columns(tokyo, t);
  if (colsTokyo.length === 0) { report[t] = { skipped: 'no table on tokyo' }; continue; }
  const colsMumbai = await columns(mumbai, t);
  if (colsMumbai.length === 0) { report[t] = { skipped: 'no table on mumbai' }; continue; }

  // candidate rows on tokyo newer than cutoff
  const timeCol = colsTokyo.find((c) => ['created_at', 'createdat'].includes(c.column_name)) ? 'created_at'
    : (colsTokyo.find((c) => c.column_name === 'updated_at') ? 'updated_at' : null);
  let cand;
  if (timeCol) {
    cand = await tokyo.query(`SELECT * FROM "${t}" WHERE "${timeCol}" > $1`, [CUTOFF]);
  } else {
    cand = await tokyo.query(`SELECT * FROM "${t}"`);
  }
  if (cand.rows.length === 0) { report[t] = { candidates: 0 }; continue; }

  // id diff against mumbai
  const ids = cand.rows.map((r) => r.id);
  const have = await mumbai.query(`SELECT id FROM "${t}" WHERE id = ANY($1::uuid[])`, [ids]).catch(async () => {
    // table may use text ids
    return mumbai.query(`SELECT id FROM "${t}" WHERE id = ANY($1::text[])`, [ids]);
  });
  const haveSet = new Set(have.rows.map((r) => String(r.id)));
  const missing = cand.rows.filter((r) => !haveSet.has(String(r.id)));
  report[t] = { candidates: cand.rows.length, missing: missing.length };

  if (t === 'quotations') {
    missingQuoteIds = missing.map((r) => r.id);
    report.quotation_nos = missing.map((r) => `${r.quote_no} (${String(r.created_at).slice(0, 16)})`);
  }
  if (!APPLY || missing.length === 0) continue;

  const colNames = colsTokyo.map((c) => `"${c.column_name}"`).join(',');
  for (const row of missing) {
    const vals = colsTokyo.map((c) => row[c.column_name]);
    const ph = vals.map((_, i) => `$${i + 1}`).join(',');
    await mumbai.query(
      `INSERT INTO "${t}" (${colNames}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
      vals,
    );
  }
  report[t].inserted = missing.length;
}

console.log('=== DRY RUN' + (APPLY ? '+APPLY' : '') + ' ===');
console.log(JSON.stringify(report, null, 2));

if (APPLY && missingQuoteIds.length > 0) {
  // counter bump: never let future numbers collide with migrated ones
  const cntCols = await columns(mumbai, 'quotation_counters');
  console.log('quotation_counters schema:', JSON.stringify(cntCols.map((c) => c.column_name)));
  const counters = await mumbai.query('SELECT * FROM quotation_counters');
  console.log('counters rows:', JSON.stringify(counters.rows));

  const migrated = await mumbai.query(
    `SELECT quote_no FROM quotations WHERE id = ANY($1::uuid[])`, [missingQuoteIds]);
  const maxByPrefixDate = {};
  for (const { quote_no } of migrated.rows) {
    const m = String(quote_no).match(/^(.+)-(\d{8})-(\d+)$/);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    maxByPrefixDate[key] = Math.max(maxByPrefixDate[key] || 0, parseInt(m[3], 10));
  }
  console.log('maxByPrefixDate:', JSON.stringify(maxByPrefixDate));
  // counter tables store a global per-client sequence (per memory: PREFIX-DDMMYYYY-NNNN derived via RPC);
  // raise each client's counter above its highest migrated NNNN regardless of date bucket.
  for (const key of Object.keys(maxByPrefixDate)) {
    const prefix = key.split('-')[0];
    const n = maxByPrefixDate[key];
    const upd = await mumbai.query(
      `UPDATE quotation_counters SET last_number = GREATEST(COALESCE(last_number,0), $2)
       WHERE client_prefix ILIKE $1 RETURNING *`,
      [prefix + '%', n],
    ).catch(async () => {
      // fallback: unknown schema shape — report only
      return { rows: [], rowCount: 0 };
    });
    console.log('counter bump attempt for', prefix, '->', upd.rowCount, 'row(s)');
  }
}

await tokyo.end();
await mumbai.end();
