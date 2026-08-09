// Throwaway probe: list every tenant's logo assets + tier-relevant config.
// Reads .env.local directly (no dotenv dependency ordering surprises).
import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}` };

const rows = await (
  await fetch(`${url}/rest/v1/clients?select=id,is_active,config`, { headers: H })
).json();

for (const r of rows) {
  const c = r.config || {};
  console.log(
    JSON.stringify({
      id: r.id,
      active: r.is_active,
      tier: c.tier ?? null,
      isPaid: c.isPaid ?? null,
      trialExpiresAt: c.trialExpiresAt ?? null,
      logoUrl: c.logoUrl || "",
      invoiceTopLogoUrl: c.invoiceTopLogoUrl || "",
      invoiceBackgroundLogoUrl: c.invoiceBackgroundLogoUrl || "",
    }),
  );
}
