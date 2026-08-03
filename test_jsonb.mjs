import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AUTH_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

async function test() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/client_public?config->>companyEmail=eq.jvenkateshupvc@gmail.com`, {
    headers: AUTH_HEADERS
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Result length:", data.length);
}

test().catch(console.error);
