import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envs = [
  {
    name: 'prod',
    url: 'https://jqjxhhgfwdzckijnnede.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxanhoaGdmd2R6Y2tpam5uZWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzY1NjcxNiwiZXhwIjoyMTAzMjMyNzE2fQ.xoUAQgNJi5Q4qwbtx2ml3CEW3O1u2Y3YK1eI1Le9z7g',
  },
  {
    name: 'staging',
    url: 'https://vvkopgfumlideeslgbmk.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2a29wZ2Z1bWxpZGVlc2xnYm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDU1NTYsImV4cCI6MjEwMzMyMTU1Nn0.7PSsExUB4dqYYXP1tonvtPmizs9uuRtJhfzNPYTQ450',
  },
];

const tables = [
  'admins',
  'app_notifications',
  'audit_logs',
  'auth_rate_limits',
  'batches',
  'bom_rules',
  'businesses',
  'clfs_audit',
  'client_config_dynamic',
  'clients',
  'content_manifest',
  'customers',
  'data_export_log',
  'feature_flags',
  'gst_invoice_counters',
  'gst_invoice_items',
  'gst_invoices',
  'gst_reports',
  'hardware',
  'lead_activities',
  'leads',
  'measured_items',
  'orders',
  'parties',
  'payments',
  'production_orders',
  'products',
  'projects',
  'quotation_3d_designs',
  'quotation_counters',
  'quotation_photos',
  'quotation_recovery_snapshots',
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

async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const env of envs) {
    const backupDir = path.join(
      rootDir,
      'supabase',
      'backups',
      `${env.name}_${stamp}`
    );
    fs.mkdirSync(backupDir, { recursive: true });

    console.log(`\n========================================`);
    console.log(`Backing up ${env.name.toUpperCase()} to: ${backupDir}`);
    console.log(`========================================`);

    const supabase = createClient(env.url, env.key);
    const manifest = {
      env: env.name,
      url: env.url,
      timestamp: new Date().toISOString(),
      tables: {},
    };

    for (const table of tables) {
      try {
        let allRows = [];
        let from = 0;
        const limit = 1000;

        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(from, from + limit - 1);

          if (error) {
            console.error(`  [!] ${table}: ${error.message}`);
            manifest.tables[table] = { status: 'error', error: error.message };
            break;
          }

          if (data && data.length > 0) {
            allRows.push(...data);
            if (data.length < limit) break;
            from += limit;
          } else {
            break;
          }
        }

        fs.writeFileSync(
          path.join(backupDir, `${table}.json`),
          JSON.stringify(allRows, null, 2),
          'utf-8'
        );

        manifest.tables[table] = { status: 'ok', rowCount: allRows.length };
        console.log(`  ✓ ${table.padEnd(30)} ${allRows.length} rows`);
      } catch (err) {
        console.error(`  [x] ${table}: ${err.message}`);
        manifest.tables[table] = { status: 'error', error: err.message };
      }
    }

    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    console.log(`\n✓ ${env.name.toUpperCase()} backup completed successfully!`);
  }
}

runBackup().catch((err) => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
