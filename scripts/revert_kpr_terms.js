const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function revertTerms() {
  // Read backup data
  const backupData = require('C:/agents/troubleshooting/supabase_backup_20260805.json');
  const backupClient = backupData.clients.find(c => c.id === 'kprupvc');
  
  if (!backupClient) {
    console.error("Client kprupvc not found in backup!");
    process.exit(1);
  }
  
  const originalConfig = backupClient.config;
  
  // Patch back to database
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.kprupvc`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ config: originalConfig })
  });
  
  if (!patchRes.ok) {
    console.error("Failed to revert kprupvc:", patchRes.statusText);
    process.exit(1);
  }
  
  console.log("SUCCESS: KPR UPVC terms and conditions have been reverted from backup.");
}

revertTerms().catch(console.error);
