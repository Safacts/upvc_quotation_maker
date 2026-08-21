// backup_production_db.js
// Full production backup via node-postgres (NOT REST API).
// Uses ::text casts for timestamptz to avoid JS Date truncation (the microsecond-fidelity gotcha).
// Output: C:\Users\aadi\supabase-backups\<ISO-timestamp>.json
//
// SECURITY: credentials are loaded from the environment (.env), never hardcoded.
// Set SUPABASE_DB_PASSWORD (and optionally SUPABASE_DB_HOST / SUPABASE_DB_USER)
// before running. See .env.example.
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gumpmnbjdtzajhysnnaz',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

if (!CONFIG.password) {
  console.error('FATAL: SUPABASE_DB_PASSWORD is not set. Add it to .env and retry.');
  process.exit(1);
}

// Tables in public schema (verified 20-08-2026 via Supabase MCP: 43 tables).
// The backup loop casts timestamptz/timestamp columns to text automatically
// (see the information_schema query), so new tables need only be added here.
const TABLES = [
  'admins',
  'audit_logs',
  'clients',
  'customers',
  'gst_invoice_counters',
  'gst_invoice_items',
  'gst_invoices',
  'measured_items',
  'products',
  'quotation_counters',
  'quotations',
  'sent_emails',
  'service_reviews',
  'signup_requests',
  'unmeasured_items',
  'vitharn_invoice_counters',
  'vitharn_invoice_items',
  'vitharn_invoices',
  'production_db_backup_20260812',
  'stock_movements',
  'tax_rates',
  'gst_reports',
  'upvc_product_config',
  'quote_approval_tokens',
  'data_export_log',
  'orders',
  'production_orders',
  'batches',
  'barcodes',
  'shopfloor_updates',
  'cutting_lists',
  'materials',
  'hardware',
  'offcuts',
  'leads',
  'lead_activities',
  'projects',
  'quotation_photos',
  'window_designs',
  'renders',
  'item_templates',
  'sso_tokens',
];

// Columns that are timestamptz — cast to text to preserve microsecond precision
const TIMESTAMPTZ_COLS = {
  clients: ['created_at', 'updated_at'],
  customers: ['created_at', 'updated_at'],
  gst_invoices: ['created_at', 'updated_at'],
  measured_items: ['created_at', 'updated_at'],
  products: ['created_at', 'updated_at'],
  quotations: ['created_at', 'updated_at', 'sent_at', 'approved_at', 'won_at', 'lost_at'],
  sent_emails: ['created_at', 'sent_at'],
  service_reviews: ['created_at', 'updated_at'],
  signup_requests: ['created_at', 'updated_at'],
  unmeasured_items: ['created_at', 'updated_at'],
  vitharn_invoices: ['created_at', 'updated_at'],
  vitharn_invoice_items: ['created_at', 'updated_at'],
};

function buildSelect(table) {
  const tsCols = TIMESTAMPTZ_COLS[table] || [];
  if (tsCols.length === 0) return `SELECT * FROM ${table}`;
  // Get all column names, cast timestamptz ones to text
  return null; // placeholder, we'll query column info first
}

async function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PRODUCTION DB BACKUP`);
  console.log(`  Timestamp: ${stamp}`);
  console.log(`  Host: ${CONFIG.host}`);
  console.log('='.repeat(60));

  const client = new Client(CONFIG);
  await client.connect();
  await client.query("SET statement_timeout = '60s'");

  const backupData = {
    _meta: {
      timestamp: new Date().toISOString(),
      project: 'gumpmnbjdtzajhysnnaz',
      region: 'aws-0-ap-northeast-1 (Tokyo)',
      pg_version: null,
      tables_backed_up: 0,
      total_rows: 0,
    },
    tables: {},
  };

  // Get PG version
  const verRes = await client.query('SELECT version()');
  backupData._meta.pg_version = verRes.rows[0].version.split(' ')[1];

  let totalRows = 0;
  let tablesDone = 0;

  for (const table of TABLES) {
    // Get column info
    const colRes = await client.query(
      `SELECT column_name, udt_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position`,
      [table]
    );

    if (colRes.rows.length === 0) {
      console.log(`  ⚠ ${table}: SKIPPED (no columns found)`);
      continue;
    }

    // Build SELECT with timestamptz cast
    const cols = colRes.rows.map(c => {
      if (c.udt_name === 'timestamptz' || c.udt_name === 'timestamp') {
        return `"${c.column_name}"::text AS "${c.column_name}"`;
      }
      return `"${c.column_name}"`;
    }).join(', ');

    const query = `SELECT ${cols} FROM public.${table}`;
    let rows;
    try {
      const r = await client.query(query);
      rows = r.rows;
    } catch (err) {
      console.log(`  ❌ ${table}: ERROR — ${err.message.split('\n')[0]}`);
      backupData.tables[table] = { error: err.message, rows: [] };
      continue;
    }

    backupData.tables[table] = rows;
    totalRows += rows.length;
    tablesDone++;
    console.log(`  ✅ ${table}: ${rows.length} rows`);
  }

  backupData._meta.tables_backed_up = tablesDone;
  backupData._meta.total_rows = totalRows;

  await client.end();

  // Write backup
  const backupDir = 'C:\\Users\\aadi\\supabase-backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filename = `${stamp}.json`;
  const filepath = path.join(backupDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

  // Also write a "latest" symlink copy
  const latestPath = path.join(backupDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(backupData, null, 2));

  const stats = fs.statSync(filepath);
  const mb = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  BACKUP COMPLETE`);
  console.log(`  Tables:  ${tablesDone}/${TABLES.length}`);
  console.log(`  Rows:    ${totalRows}`);
  console.log(`  Size:    ${mb} MB`);
  console.log(`  File:    ${filepath}`);
  console.log(`  Latest:  ${latestPath}`);
  console.log('─'.repeat(60));
}

backup().catch(err => {
  console.error('BACKUP FAILED:', err.message);
  process.exit(1);
});
