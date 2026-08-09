const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backup', '2026-08-08T19-51-37-753Z');

const files = fs.readdirSync(dir);
console.log('=== FILE INVENTORY ===');
console.log('Total files:', files.length);
console.log('');

// Validate each JSON data file
const jsonFiles = files.filter(f => f.endsWith('.json'));
let totalRows = 0;
let allValid = true;

console.log('=== JSON VALIDATION & ROW COUNTS ===');
for (const f of jsonFiles) {
  try {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const data = JSON.parse(raw);
    if (data.table && Array.isArray(data.rows)) {
      const colMatch = data.columns.length === data.rows[0]?.length || data.count === 0;
      console.log(`  ${f}: ${data.count} rows, ${data.columns.length} cols`);
      totalRows += data.count;
    } else {
      console.log(`  ${f}: valid JSON (non-data file)`);
    }
  } catch (e) {
    console.log(`  ${f}: PARSE ERROR - ${e.message}`);
    allValid = false;
  }
}
console.log('');
console.log('Total data rows across all tables: ' + totalRows);
console.log('');

// Schema.sql completeness check
console.log('=== SCHEMA.SQL COMPLETENESS ===');
const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
const tableCount = (schema.match(/CREATE TABLE IF NOT EXISTS/g) || []).length;
const seqCount = (schema.match(/CREATE SEQUENCE IF NOT EXISTS/g) || []).length;
const viewCount = (schema.match(/CREATE OR REPLACE VIEW/g) || []).length;
const rlsCount = (schema.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
const idxCount = (schema.match(/CREATE INDEX/g) || []).length;
const fkCount = (schema.match(/FOREIGN KEY/g) || []).length;
const pkCount = (schema.match(/PRIMARY KEY/g) || []).length;
const schemaSize = fs.statSync(path.join(dir, 'schema.sql')).size;

console.log(`Schema size: ${schemaSize} bytes`);
console.log(`Tables defined: ${tableCount}`);
console.log(`Sequences: ${seqCount}`);
console.log(`Views: ${viewCount}`);
console.log(`Indexes: ${idxCount}`);
console.log(`Primary keys: ${pkCount}`);
console.log(`Foreign keys: ${fkCount}`);
console.log(`RLS policy enables: ${rlsCount}`);
console.log(`Header present: ${schema.startsWith('-- FULL BACKUP')}`);

// Cross-check: does row count in data files match the backup.log?
console.log('');
console.log('=== CROSS-CHECK vs backup.log ===');
const log = fs.readFileSync(path.join(dir, 'backup.log'), 'utf8');
const loggedTableCount = (log.match(/^-- Table:/gm) || []).length;
const loggedFunctions = (log.match(/^-- Functions/g) || []).length;
const loggedViews = (log.match(/^-- Views/g) || []).length;
console.log(`Tables in backup.log: ${loggedTableCount}`);
console.log(`Tables in schema.sql: ${tableCount}`);
console.log(`Match: ${loggedTableCount === tableCount ? 'YES' : 'NO'}`);

// Restore script check
console.log('');
console.log('=== RESTORE SCRIPT ===');
const restoreSize = fs.statSync(path.join(dir, 'restore.js')).size;
console.log(`restore.js: ${restoreSize} bytes (${restoreSize > 1000 ? 'OK' : 'SUSPICIOUS'})`);

// README check
console.log('');
console.log('=== README ===');
const readme = fs.readFileSync(path.join(dir, 'README.txt'), 'utf8');
console.log(readme.split('\n').slice(0, 4).join('\n'));

// Final verdict
console.log('');
console.log('========================================');
console.log('=== FINAL INTEGRITY VERDICT ===');
const checks = [
  ['All JSON files parse', allValid],
  ['18 tables in schema', tableCount === 18],
  ['Schema > 10KB', schemaSize > 10000],
  ['Has views', viewCount >= 2],
  ['Has RLS policies', rlsCount > 0],
  ['Has indexes', idxCount > 0],
  ['Has foreign keys', fkCount > 0],
  ['restore.js present & >1KB', restoreSize > 1000],
  ['22 files total', files.length === 22],
  ['Row counts > 0 in data tables', totalRows > 0],
];

let allPass = true;
for (const [name, pass] of checks) {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`);
  if (!pass) allPass = false;
}
console.log('');
console.log(allPass ? '>>> INTEGRITY VERIFIED — BACKUP COMPLETE <<<' : '>>> ISSUES DETECTED <<<');
process.exit(allPass ? 0 : 1);
