const { Client } = require('pg');

async function fixSchema() {
  const client = new Client({
    host: 'aws-1-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.gumpmnbjdtzajhysnnaz',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to pooler.');
    await client.query("ALTER TABLE quotations ADD COLUMN IF NOT EXISTS supplier_company text DEFAULT '';");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Column added and schema reloaded!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixSchema();
