const { Client } = require("pg");
const c = new Client({
  host: "aws-0-ap-northeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.gumpmnbjdtzajhysnnaz", password: "weRCL38blulCQHRd",
  database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

async function main() {
  await c.connect();
  console.log("CONNECTED");

  // clients table
  const clients = await c.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' ORDER BY ordinal_position`);
  console.log("=== clients ===");
  clients.rows.forEach(r => console.log(JSON.stringify(r)));

  // admins table
  const admins = await c.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='admins' ORDER BY ordinal_position`);
  console.log("\n=== admins ===");
  admins.rows.forEach(r => console.log(JSON.stringify(r)));

  // clients.config sample
  const config = await c.query(`SELECT id, config FROM clients LIMIT 2`);
  console.log("\n=== clients.config sample ===");
  config.rows.forEach(r => console.log(JSON.stringify(r)));

  // RLS policies on customers
  const policies = await c.query(`SELECT policyname, cmd, qual, withcheck FROM pg_policies WHERE tablename='customers'`);
  console.log("\n=== customers RLS policies ===");
  policies.rows.forEach(r => console.log(JSON.stringify(r)));

  await c.end();
  console.log("\nDONE");
}
main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
