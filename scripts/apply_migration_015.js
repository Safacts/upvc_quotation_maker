const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const TARGETS = {
  production: {
    label: "PRODUCTION",
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.gumpmnbjdtzajhysnnaz",
    password: "weRCL38blulCQHRd",
    database: "postgres",
  },
  staging: {
    label: "STAGING",
    host: "aws-1-ap-south-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.effxrwrbsjduvhmorvrq",
    password: "Aadisheshu1.",
    database: "postgres",
  },
};

const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "015_drop_public_all_customers.sql"
);

function readMigrationAscii() {
  const buf = fs.readFileSync(MIGRATION);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new Error("Migration file has a UTF-8 BOM. Rewrite it as pure ASCII.");
  }
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 0x7f) {
      throw new Error(
        `Migration file has a non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}.`
      );
    }
  }
  return buf.toString("ascii");
}

async function run(targetName) {
  const t = TARGETS[targetName];
  if (!t) {
    throw new Error(`Unknown target '${targetName}'. Use 'production' or 'staging'.`);
  }

  const sql = readMigrationAscii();
  console.log(`ASCII/BOM check: PASS (${sql.length} bytes, pure ASCII, no BOM)`);

  const client = new Client({
    host: t.host,
    port: t.port,
    user: t.user,
    password: t.password,
    database: t.database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  await client.connect();
  console.log(`CONNECTED [${t.label}]: ${t.host} as ${t.user}`);

  const before = await client.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='customers' ORDER BY policyname;
  `);
  console.log(`\nBEFORE - customers policies (${before.rows.length}):`);
  before.rows.forEach((r) => console.log(`  - ${r.policyname}`));

  console.log("\nAPPLYING 015_drop_public_all_customers.sql ...");
  await client.query(sql);
  console.log("APPLIED (BEGIN/COMMIT inside migration) + NOTIFY pgrst sent");

  const after = await client.query(`
    SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename='customers' ORDER BY policyname;
  `);
  console.log(`\nAFTER - customers policies (${after.rows.length}):`);
  after.rows.forEach((r) =>
    console.log(`  - ${r.policyname} | cmd=${r.cmd} | roles=${r.roles} | qual=${r.qual}`)
  );

  const names = after.rows.map((r) => r.policyname);
  let pass = 0;
  let fail = 0;
  const check = (label, ok) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}: ${label}`);
    ok ? pass++ : fail++;
  };

  console.log("\n=== VERIFICATION ===");
  check("'Allow public all on customers' is ABSENT", !names.includes("Allow public all on customers"));
  check(
    "'Allow service_role full access on customers' still present",
    names.includes("Allow service_role full access on customers")
  );
  check("'client_isolation_customers' still present", names.includes("client_isolation_customers"));

  const rls = await client.query(`
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customers'::regclass;
  `);
  check("RLS still enabled on customers", rls.rows[0].relrowsecurity === true);

  const prod = await client.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='products' ORDER BY policyname;
  `);
  console.log(`\nproducts policies (out of scope, report only) (${prod.rows.length}):`);
  prod.rows.forEach((r) => console.log(`  - ${r.policyname}`));

  const custCount = await client.query(`SELECT count(*)::int AS n FROM public.customers;`);
  const prodCount = await client.query(`SELECT count(*)::int AS n FROM public.products;`);
  console.log(`\nRow counts: customers=${custCount.rows[0].n}, products=${prodCount.rows[0].n}`);

  await client.end();
  console.log(`\n=== [${t.label}] SUMMARY: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/apply_migration_015.js <production|staging>");
  process.exit(1);
}
run(target).catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
