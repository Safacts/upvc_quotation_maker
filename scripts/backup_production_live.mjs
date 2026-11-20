import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Production Supabase credentials
const PROD_URL = 'https://jqjxhhgfwdzckijnnede.supabase.co';
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxanhoaGdmd2R6Y2tpam5uZWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzY1NjcxNiwiZXhwIjoyMTAzMjMyNzE2fQ.xoUAQgNJi5Q4qwbtx2ml3CEW3O1u2Y3YK1eI1Le9z7g';

const supabase = createClient(PROD_URL, PROD_KEY, {
  auth: { persistSession: false },
});

const ALL_TABLES = [
  'admins',
  'app_notifications',
  'audit_logs',
  'auth_rate_limits',
  'batches',
  'bom_rules',
  'businesses',
  'client_config_dynamic',
  'clients',
  'clfs_audit',
  'content_manifest',
  'customers',
  'data_export_log',
  'feature_flags',
  'gst_invoice_counters',
  'gst_invoice_items',
  'gst_invoices',
  'gst_reports',
  'hardware',
  'item_templates',
  'lead_activities',
  'leads',
  'measured_items',
  'offcut_inventory',
  'orders',
  'parties',
  'payments',
  'price_elements',
  'price_structures',
  'production_orders',
  'products',
  'profile_catalog',
  'project_openings',
  'projects',
  'quotation_3d_designs',
  'quotation_counters',
  'quotation_photos',
  'quotation_recovery_snapshots',
  'quotation_revisions',
  'quotation_share_tokens',
  'quotations',
  'quote_approval_tokens',
  'rate_card_items',
  'raw_materials',
  'sent_emails',
  'service_reviews',
  'shopfloor_updates',
  'signup_requests',
  'sso_tokens',
  'stock_movements',
  'sync_log',
  'tara_conversations',
  'tara_messages',
  'tax_rates',
  'taxes',
  'tier_activations',
  'units',
  'unmeasured_items',
  'users',
  'vitharn_invoice_counters',
  'vitharn_invoice_items',
  'vitharn_invoices',
  'window_designs',
];

async function backupTable(tableName) {
  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { status: 'error', error: error.message, rows: [] };
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    } else {
      break;
    }
  }

  return { status: 'ok', rows: allRows };
}

async function main() {
  const startTime = new Date();
  const stamp = startTime.toISOString().replace(/[:.]/g, '-');
  
  // Backup targets
  const repoBackupDir = path.join(rootDir, 'supabase', 'backups', `prod_${stamp}`);
  const userBackupDir = path.join('C:\\Users\\aadi\\supabase-backups', `prod_${stamp}`);
  const userBackupRoot = 'C:\\Users\\aadi\\supabase-backups';

  fs.mkdirSync(repoBackupDir, { recursive: true });
  fs.mkdirSync(userBackupDir, { recursive: true });

  console.log('='.repeat(70));
  console.log('  SUPABASE PRODUCTION FULL BACKUP');
  console.log(`  Project URL: ${PROD_URL}`);
  console.log(`  Timestamp  : ${startTime.toISOString()}`);
  console.log(`  Repo Target: ${repoBackupDir}`);
  console.log(`  User Target: ${userBackupDir}`);
  console.log('='.repeat(70));

  const manifest = {
    project: 'jqjxhhgfwdzckijnnede',
    url: PROD_URL,
    timestamp: startTime.toISOString(),
    completedAt: null,
    durationMs: null,
    totalTables: ALL_TABLES.length,
    successfulTables: 0,
    failedTables: 0,
    totalRows: 0,
    tables: {},
  };

  const consolidated = {
    _meta: {
      project: 'jqjxhhgfwdzckijnnede',
      url: PROD_URL,
      timestamp: startTime.toISOString(),
      totalTables: ALL_TABLES.length,
      totalRows: 0,
    },
    tables: {},
  };

  let totalRows = 0;
  let successfulTables = 0;
  let failedTables = 0;

  for (const table of ALL_TABLES) {
    process.stdout.write(`  -> Backing up ${table.padEnd(32)}: `);
    const result = await backupTable(table);

    if (result.status === 'ok') {
      const rowCount = result.rows.length;
      totalRows += rowCount;
      successfulTables++;

      manifest.tables[table] = {
        status: 'ok',
        rowCount,
      };
      consolidated.tables[table] = result.rows;

      // Save individual table JSON to repo target
      fs.writeFileSync(
        path.join(repoBackupDir, `${table}.json`),
        JSON.stringify(result.rows, null, 2),
        'utf-8'
      );
      // Save individual table JSON to user target
      fs.writeFileSync(
        path.join(userBackupDir, `${table}.json`),
        JSON.stringify(result.rows, null, 2),
        'utf-8'
      );

      console.log(`OK (${rowCount} rows)`);
    } else {
      failedTables++;
      manifest.tables[table] = {
        status: 'error',
        error: result.error,
      };
      console.log(`ERROR (${result.error})`);
    }
  }

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  manifest.completedAt = endTime.toISOString();
  manifest.durationMs = durationMs;
  manifest.successfulTables = successfulTables;
  manifest.failedTables = failedTables;
  manifest.totalRows = totalRows;
  consolidated._meta.totalRows = totalRows;

  // Write manifests
  fs.writeFileSync(path.join(repoBackupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  fs.writeFileSync(path.join(userBackupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Write single consolidated backup file
  const consolidatedFilename = `${stamp}-production.json`;
  const consolidatedFilePath = path.join(userBackupRoot, consolidatedFilename);
  fs.writeFileSync(consolidatedFilePath, JSON.stringify(consolidated, null, 2), 'utf-8');

  // Update latest.json
  const latestFilePath = path.join(userBackupRoot, 'latest.json');
  fs.writeFileSync(latestFilePath, JSON.stringify(consolidated, null, 2), 'utf-8');

  const stats = fs.statSync(consolidatedFilePath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('-'.repeat(70));
  console.log('  BACKUP COMPLETE');
  console.log(`  Duration         : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  Tables Backed Up : ${successfulTables}/${ALL_TABLES.length}`);
  console.log(`  Total Rows       : ${totalRows.toLocaleString()}`);
  console.log(`  Consolidated Size: ${sizeMb} MB`);
  console.log(`  User Target Dir  : ${userBackupDir}`);
  console.log(`  Repo Target Dir  : ${repoBackupDir}`);
  console.log(`  Consolidated File: ${consolidatedFilePath}`);
  console.log(`  Latest Pointer   : ${latestFilePath}`);
  console.log('-'.repeat(70));
}

main().catch((err) => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
