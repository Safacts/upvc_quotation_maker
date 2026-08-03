require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Running schema migrations for dashboard upgrade...');
  
  // 1. Add status column to quotations
  const { error: err1 } = await supabase.rpc('execute_sql', {
    sql_query: `
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'sent', 'won', 'lost'));
    `
  });
  if (err1) {
    console.error('Error adding status to quotations:', err1);
    // fallback if execute_sql RPC doesn't exist
  } else {
    console.log('Status column added to quotations');
  }

  // 2. Add cost_margin_percent to client_public
  const { error: err2 } = await supabase.rpc('execute_sql', {
    sql_query: `
      ALTER TABLE client_public
      ADD COLUMN IF NOT EXISTS cost_margin_percent NUMERIC DEFAULT 65;
    `
  });
  if (err2) {
    console.error('Error adding cost_margin_percent to client_public:', err2);
  } else {
    console.log('cost_margin_percent added to client_public');
  }
}

run();
