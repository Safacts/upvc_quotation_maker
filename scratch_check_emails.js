const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:AADISHESHu1.@db.effxrwrbsjduvhmorvrq.supabase.co:5432/postgres'
  });
  await client.connect();
  console.log('Connected to PG!');

  // Check sent_emails table content directly
  const res = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
  `);
  console.log('Triggers:', res.rows);

  const funcs = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace 
    WHERE n.nspname = 'public'
  `);
  console.log('Functions:', funcs.rows.map(f => f.proname));

  await client.end();
}

run().catch(console.error);
