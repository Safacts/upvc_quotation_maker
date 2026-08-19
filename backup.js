const fs = require('fs');
const { Client } = require('pg');
const OUT = 'C:/Projects/myprojects/flutterprojects/upvc_quotation_maker/backup.log';
const log = m => fs.appendFileSync(OUT, m + '\n');
const PW = 'AADISHESHu1.';
const ref = process.argv[2] || 'effxrwrbsjduvhmorvrq';
const connStr = r => 'postgresql://postgres:' + encodeURIComponent(PW) + '@db.' + r + '.supabase.co:5432/postgres';
function connect(r) { return new Promise((res, rej) => { const c = new Client({ connectionString: connStr(r), connectionTimeoutMillis: 15000 }); c.connect().then(() => res(c)).catch(e => rej(e)); }); }
async function connectRetry(r, tries = 30) { for (let i = 1; i <= tries; i++) { try { const c = await connect(r); log('connected ' + r); return c; } catch (e) { log('connect ' + r + ' try ' + i + ' FAIL: ' + String(e.message).split('\n')[0]); await new Promise(z => setTimeout(z, 3000)); } } throw new Error('no connect ' + r); }
(async () => {
  try {
    const c = await connectRetry(ref);
    const t = await c.query("select table_name from information_schema.tables where table_schema='public' order by table_name");
    const dump = { ref, schema: 'public', tables: {} };
    let total = 0;
    for (const row of t.rows) {
      const name = row.table_name;
      const d = await c.query('SELECT * FROM public."' + name + '"');
      dump.tables[name] = d.rows;
      total += d.rows.length;
      log('backed up ' + name + ' (' + d.rows.length + ' rows)');
    }
    const file = 'C:/Users/aadi/AppData/Local/Temp/opencode/backups/' + ref + '_' + new Date().toISOString().slice(0, 10) + '.json';
    fs.writeFileSync(file, JSON.stringify(dump));
    log('=== backup written: ' + file + ' (' + total + ' rows, ' + t.rows.length + ' tables) ===');
    await c.end();
  } catch (e) { log('FATAL ' + e.message); process.exit(1); }
})();
