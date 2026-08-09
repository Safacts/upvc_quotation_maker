const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const REF = "effxrwrbsjduvhmorvrq";
const PASSWORD = "Aadisheshu1.";
const HOST = "aws-1-ap-south-1.pooler.supabase.com";
const PORT = 5432;
const USER = "postgres.effxrwrbsjduvhmorvrq";

async function restore(backupDir) {
  const client = new Client({
    host: HOST, port: PORT, user: USER, password: PASSWORD,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Apply schema
  const schemaSql = fs.readFileSync(path.join(backupDir, "schema.sql"), "utf8");
  await client.query(schemaSql);
  console.log("Schema applied.");

  // Import data from JSON files
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".json"));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(backupDir, file), "utf8"));
    if (data.count === 0) continue;
    const cols = data.columns.map(c => `"${c}"`).join(", ");
    const placeholders = data.columns.map((_, i) => `$${i + 1}`).join(", ");
    const insertSql = `INSERT INTO "${data.table}" (${cols}) VALUES (${placeholders})`;
    
    let inserted = 0;
    for (const row of data.rows) {
      const values = data.columns.map(c => row[c]);
      try {
        await client.query(insertSql, values);
        inserted++;
      } catch (e) {
        console.error(`  row error in ${data.table}: ${e.message}`);
      }
    }
    console.log(`  ${data.table}: ${inserted}/${data.count} rows inserted`);
  }

  await client.end();
  console.log("Restore complete.");
}

const dir = process.argv[2];
if (!dir) { console.error("Usage: node restore.js <backup-dir>"); process.exit(1); }
restore(dir).catch(e => { console.error(e); process.exit(1); });
