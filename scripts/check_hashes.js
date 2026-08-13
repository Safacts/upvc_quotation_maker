#!/usr/bin/env node
const pg = require('pg');

const DB_CONFIG = {
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.gumpmnbjdtzajhysnnaz',
  password: 'weRCL38blulCQHRd',
  ssl: { rejectUnauthorized: false }
};

async function main() {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  
  try {
    const result = await client.query(
      `SELECT id, password_hash, config->>'portalPasswordHash' as cfg_hash,
              config->>'companyEmail' as company_email,
              config->>'adminEmails' as admin_emails
       FROM clients 
       WHERE id IN ('venkateshwara', 'kprupvc', 'akshaya upvc')
       ORDER BY id`
    );
    
    for (const row of result.rows) {
      console.log(`\n=== ${row.id} ===`);
      console.log(`  password_hash: ${row.password_hash}`);
      console.log(`  cfg_hash:      ${row.cfg_hash}`);
      console.log(`  match:         ${row.password_hash === row.cfg_hash ? 'YES' : 'NO'}`);
      console.log(`  company_email: ${row.company_email}`);
      console.log(`  admin_emails:  ${row.admin_emails}`);
    }
    
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
