const fs = require('fs');


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function updateTerms() {
  // First fetch current config
  const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.kprupvc&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  
  if (!res.ok) {
    console.error("Failed to fetch kprupvc:", res.statusText);
    process.exit(1);
  }
  
  const clients = await res.json();
  if (clients.length === 0) {
    console.error("Client kprupvc not found!");
    process.exit(1);
  }
  
  const config = clients[0].config;
  
  // Update terms
  config.termsAndConditions = [
    "1. 50% Advance payment required upon order confirmation; remaining 50% before material delivery/installation.",
    "2. Quotation is valid for 15 days from the date of issue.",
    "3. Delivery and installation will take approximately 15-20 working days from the date of advance payment.",
    "4. Civil work, masonry, and scaffolding (if required) are not included and must be arranged by the customer.",
    "5. 10-year warranty on UPVC profiles against discoloration, and 1-year warranty on hardware/accessories."
  ];
  
  // Patch back to database
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.kprupvc`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ config })
  });
  
  if (!patchRes.ok) {
    console.error("Failed to update kprupvc:", patchRes.statusText);
    process.exit(1);
  }
  
  console.log("SUCCESS: KPR UPVC terms and conditions have been updated to proper business terms.");
}

updateTerms().catch(console.error);
