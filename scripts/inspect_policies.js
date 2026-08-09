const { Client } = require("pg");
const c = new Client({
  host: "aws-1-ap-south-1.pooler.supabase.com", port: 5432,
  user: "postgres.effxrwrbsjduvhmorvrq", password: "Aadisheshu1.",
  database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

async function main() {
  await c.connect();
  console.log("CONNECTED to staging");

  // RLS policies on customers
  const policies = await c.query(`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='customers'`);
  console.log("=== customers RLS policies ===");
  policies.rows.forEach(r => console.log(JSON.stringify(r)));

  // RLS policies on products
  const policies2 = await c.query(`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='products'`);
  console.log("\n=== products RLS policies ===");
  policies2.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check admin user for existing clients
  const admins = await c.query(`SELECT email FROM admins`);
  console.log("\n=== admins ===");
  admins.rows.forEach(r => console.log(JSON.stringify(r)));

  await c.end();
  console.log("\nDONE");
}
main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
