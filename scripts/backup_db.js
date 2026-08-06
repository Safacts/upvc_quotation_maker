const fs = require('fs');
const path = require('path');


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function backup() {
  const tables = ['clients', 'admins', 'quotations', 'measured_items', 'unmeasured_items', 'sent_emails'];
  const backupData = {};
  
  for (const table of tables) {
    console.log(`Fetching table: ${table}...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch ${table}: ${res.statusText}`);
      process.exit(1);
    }
    
    backupData[table] = await res.json();
    console.log(`Saved ${backupData[table].length} rows from ${table}.`);
  }
  
  const backupDir = 'C:\\agents\\troubleshooting';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const backupPath = path.join(backupDir, 'supabase_backup_20260805.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log(`\nSUCCESS: Production DB Backup securely stored at:\n${backupPath}`);
}

backup().catch(err => console.error(err));
