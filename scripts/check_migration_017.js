const { Client } = require('pg');

async function checkStaging() {
  console.log('--- STAGING (effxrwrbsjduvhmorvrq) ---');
  const client = new Client({
    host: 'aws-1-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.effxrwrbsjduvhmorvrq',
    password: 'Aadisheshu1.',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    queryTimeoutMillis: 10000
  });
  await client.connect();
  console.log('Connected to staging pooler');

  // Check if clients.tier column exists
  const colRes = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_name='clients' AND column_name='tier'`
  );
  if (colRes.rows.length > 0) {
    console.log('clients.tier: EXISTS (' + colRes.rows[0].data_type + ', default=' + colRes.rows[0].column_default + ', nullable=' + colRes.rows[0].is_nullable + ')');
  } else {
    console.log('clients.tier: MISSING');
  }

  // Check if 3 clients have tier='final'
  const tierRes = await client.query(`SELECT id, tier FROM clients ORDER BY id`);
  console.log('All clients:');
  tierRes.rows.forEach(r => console.log('  ', r.id, '-> tier=' + r.tier));

  const finalRes = await client.query(`SELECT id FROM clients WHERE tier='final'`);
  console.log('Clients with tier=final:', finalRes.rows.length);

  await client.end();
}

async function checkProduction() {
  console.log('\n--- PRODUCTION (gumpmnbjdtzajhysnnaz) ---');
  const client = new Client({
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gumpmnbjdtzajhysnnaz',
    password: 'weRCL38blulCQHRd',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    queryTimeoutMillis: 10000
  });
  await client.connect();
  console.log('Connected to production pooler');

  // Check if clients.tier column exists
  const colRes = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name='clients' AND column_name='tier'`
  );
  if (colRes.rows.length > 0) {
    console.log('clients.tier: EXISTS (' + colRes.rows[0].data_type + ') -- UNEXPECTED!');
  } else {
    console.log('clients.tier: NOT EXISTS (correct - migration 017 not applied to production)');
  }

  await client.end();
}

(async () => {
  try { await checkStaging(); } catch(e) { console.error('STAGING ERROR:', e.message); }
  try { await checkProduction(); } catch(e) { console.error('PRODUCTION ERROR:', e.message); }
  console.log('\n--- DONE ---');
})();
