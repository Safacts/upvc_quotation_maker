const fs = require('fs');
const { Client } = require('pg');
const OUT = 'C:/Projects/myprojects/flutterprojects/upvc_quotation_maker/pwtest.txt';
const log = m => fs.appendFileSync(OUT, m + '\n');
fs.writeFileSync(OUT, '');
function test(ref, pw) {
  return new Promise(res => {
    const c = new Client({ connectionString: 'postgresql://postgres:' + encodeURIComponent(pw) + '@db.' + ref + '.supabase.co:5432/postgres', connectionTimeoutMillis: 20000 });
    c.connect()
      .then(() => c.query("select count(*) n from information_schema.tables where table_schema='public'"))
      .then(r => { log('OK ref=' + ref + ' pw=' + pw + ' tables=' + r.rows[0].n); return c.end(); })
      .catch(e => { log('FAIL ref=' + ref + ' pw=' + pw + ': ' + String(e.message).split('\n')[0]); })
      .finally(() => res());
  });
}
(async () => {
  const ref = 'gumpmnbjdtzajhysnnaz';
  for (const pw of ['AADISHESHu1.', 'AADISHESHU1.', 'Jvenkatesh@123']) {
    for (let i = 1; i <= 2; i++) {
      log('-- PROD try ' + i + ' pw=' + pw);
      await test(ref, pw);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  log('DONE');
})();
