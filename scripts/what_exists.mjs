/**
 * Quick probe: which tables/objects actually exist on the live DB?
 * Tests every object migrations 004-010 claim to have created.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
function loadEnv(file) {
  const p = resolve(root, file);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p,'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g,'');
  }
  return out;
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...process.env };
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = `${URL}/rest/v1`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const tables = [
  'admins','clients','client_public','quotations','measured_items','unmeasured_items',
  'quotation_counters','signup_requests','vitharn_invoices','vitharn_invoice_items',
  'vitharn_invoice_counters','gst_invoices','gst_invoice_items','gst_invoice_counters',
  'service_reviews','customers','products','audit_logs','quotation_money',
];
const rpcs = [
  'get_next_quote_number','get_next_gst_invoice_number','get_next_vitharn_invoice_number',
  'search_quotations','get_quote_stats',
];

let live = 0, missing = 0;
console.log('\n── TABLES/VIEWS ──');
for (const t of tables) {
  const r = await fetch(`${BASE}/${t}?limit=0`, { headers: H });
  const body = await r.text();
  const status = r.status === 200 ? '✓ LIVE' : `✗ ${r.status}`;
  if (r.status === 200) live++; else missing++;
  console.log(`  ${status}  ${t}`);
}

console.log('\n── RPCs ──');
for (const fn of rpcs) {
  const r = await fetch(`${BASE}/rpc/${fn}`, { method:'POST', headers: { ...H, 'Content-Type':'application/json' }, body: '{}' });
  const status = r.status === 200 || r.status === 400 ? '✓ LIVE' : `✗ ${r.status}`;
  // 400 = function exists but bad args; 404 = function missing
  if (r.status === 200 || r.status === 400) live++; else missing++;
  console.log(`  ${status}  ${fn}`);
}

console.log(`\n── SUMMARY: ${live} live, ${missing} missing ──`);
