// apply_migration_059_prod_api.js
// Applies migration 059 to PROD (jqjxhhgfwdzckijnnede) via the Supabase Management API
// (pooler DB password for prod is not on file; the sbp token is).
// The token is read from C:\Users\aadi\.agent-mcp\mcp.env and NEVER printed.
// Usage: node scripts/apply_migration_059_prod_api.js
const fs = require("fs");

const MCP_ENV = "C:\\Users\\aadi\\.agent-mcp\\mcp.env";
const PROJECT_REF = "jqjxhhgfwdzckijnnede";

function loadEnvLine(key) {
  const env = fs.readFileSync(MCP_ENV, "utf8");
  const m = env.match(new RegExp("^" + key + "=(.+)$", "m"));
  if (!m) throw new Error(`${key} missing in mcp.env`);
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

async function mgmtQuery(token, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const token = loadEnvLine("SUPABASE_ACCESS_TOKEN_SAFACS");
  console.log("Token loaded (not printed). Applying migration 059 to PROD...");

  // One statement per call (Management API limit).
  await mgmtQuery(
    token,
    "ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false",
  );
  console.log("ALTER applied.");
  await mgmtQuery(token, "NOTIFY pgrst, 'reload schema'");
  console.log("NOTIFY sent.");
  const verify = await mgmtQuery(
    token,
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='is_interstate'",
  );
  console.log("VERIFY response:", verify.slice(0, 300));
  if (!verify.includes("is_interstate")) {
    throw new Error("Column not found after apply.");
  }
  console.log("VERIFIED [production]: public.quotations.is_interstate present.");
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
