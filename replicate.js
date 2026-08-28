const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();
const OUT = 'C:/Projects/myprojects/flutterprojects/upvc_quotation_maker/replicate.log';
const log = m => { fs.appendFileSync(OUT, m + '\n'); };
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) throw new Error('SUPABASE_DB_PASSWORD missing — set in .env');
const PROD = 'gumpmnbjdtzajhysnnaz';
const STAG = 'effxrwrbsjduvhmorvrq';
const connStr = ref => 'postgresql://postgres:' + encodeURIComponent(PW) + '@db.' + ref + '.supabase.co:5432/postgres';

function connect(ref) {
  return new Promise((res, rej) => {
    const c = new Client({ connectionString: connStr(ref), connectionTimeoutMillis: 15000 });
    c.connect().then(() => res(c)).catch(e => rej(e));
  });
}
async function connectWithRetry(ref, tries = 40) {
  for (let i = 1; i <= tries; i++) {
    try { const c = await connect(ref); log('connected ' + ref + ' (try ' + i + ')'); return c; }
    catch (e) { log('connect ' + ref + ' try ' + i + ' FAIL: ' + String(e.message).split('\n')[0]); await new Promise(r => setTimeout(r, 3000)); }
  }
  throw new Error('could not connect ' + ref);
}
async function tablesOf(c, schema) {
  const r = await c.query("select table_name from information_schema.tables where table_schema=$1 order by table_name", [schema]);
  return r.rows.map(x => x.table_name);
}
async function columnsOf(c, schema, table) {
  const r = await c.query(`select a.attname as name, format_type(a.atttypid,a.atttypmod) as typ,
    (a.attnotnull) as notnull, pg_get_expr(d.adbin,d.adrelid) as def
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=($1||'.'||$2)::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`,
    [schema, table]);
  return r.rows;
}
async function pkOf(c, schema, table) {
  const r = await c.query(`select kcu.column_name from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    where tc.table_schema=$1 and tc.table_name=$2 and tc.constraint_type='PRIMARY KEY' order by kcu.ordinal_position`,
    [schema, table]);
  return r.rows.map(x => x.column_name);
}
async function fksOf(c, schema, table) {
  const r = await c.query(`select kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
    where tc.table_schema=$1 and tc.table_name=$2 and tc.constraint_type='FOREIGN KEY'`,
    [schema, table]);
  return r.rows;
}
async function copyTable(prod, stag, table) {
  const cols = await columnsOf(prod, 'public', table);
  const pk = await pkOf(prod, 'public', table);
  const colDefs = cols.map(col => {
    let d = '"' + col.name + '" ' + col.typ;
    if (col.notnull === true || col.notnull === 't') d += ' NOT NULL';
    if (col.def != null) d += ' DEFAULT ' + col.def;
    return d;
  });
  if (pk.length) colDefs.push('PRIMARY KEY (' + pk.map(p => '"' + p + '"').join(', ') + ')');
  const ddl = 'CREATE TABLE public."' + table + '" (' + colDefs.join(', ') + ');';
  await stag.query('DROP TABLE IF EXISTS public."' + table + '" CASCADE;');
  await stag.query(ddl);
  const fks = await fksOf(prod, 'public', table);
  for (const fk of fks) {
    try { await stag.query('ALTER TABLE public."' + table + '" ADD FOREIGN KEY ("' + fk.column_name + '") REFERENCES public."' + fk.ref_table + '" ("' + fk.ref_col + '");'); }
    catch (e) { log('  FK skip ' + table + '->' + fk.ref_table + ': ' + String(e.message).split('\n')[0]); }
  }
  const data = await prod.query('SELECT * FROM public."' + table + '"');
  let n = 0;
  if (data.rows.length) {
    const colNames = data.fields.map(f => f.name);
    const placeholders = data.rows.map((_, ri) => '(' + colNames.map((_, ci) => '$' + (ri * colNames.length + ci + 1)).join(', ') + ')').join(', ');
    const vals = [];
    data.rows.forEach(r => colNames.forEach(cn => vals.push(r[cn])));
    const sql = 'INSERT INTO public."' + table + '" ("' + colNames.join('", "') + '") VALUES ' + placeholders + ';';
    await stag.query(sql, vals);
    n = data.rows.length;
  }
  log('  copied ' + table + ' (' + n + ' rows)');
  return n;
}
(async () => {
  try {
    log('=== replicate prod->staging start ===');
    const prod = await connectWithRetry(PROD);
    const stag = await connectWithRetry(STAG);
    await stag.query("SET session_replication_role = 'replica';");
    const tables = await tablesOf(prod, 'public');
    log('prod public tables: ' + tables.length);
    let total = 0;
    for (const t of tables) { total += await copyTable(prod, stag, t); }
    await stag.query("SET session_replication_role = 'origin';");
    log('=== DONE total rows copied: ' + total + ' across ' + tables.length + ' tables ===');
    await prod.end(); await stag.end();
  } catch (e) { log('FATAL ' + e.message); process.exit(1); }
})();
