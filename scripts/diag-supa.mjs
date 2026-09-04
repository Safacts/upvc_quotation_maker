import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL:", url);
console.log("Service Key starts with:", key?.substring(0, 10));

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase
    .from("clients")
    .select("id,password_hash,config")
    .eq("id", "eshanya_trade_links")
    .maybeSingle();

  console.log("Error:", error);
  console.log("Client id:", data?.id);
  console.log("Config adminEmails:", data?.config?.adminEmails);
  console.log("Config companyEmail:", data?.config?.companyEmail);
}

check();
