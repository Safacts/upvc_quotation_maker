#!/usr/bin/env node
/**
 * Diagnostic: Check all UPVC clients in production DB
 * - venkateshwara
 * - kprupvc
 * - akshaya-upvc
 */

const pg = require('pg');

const DB_CONFIG = {
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.gumpmnbjdtzajhysnnaz',
  password: 'weRCL38blulCQHRd',
  ssl: { rejectUnauthorized: false }
};

const TARGET_CLIENTS = ['venkateshwara', 'kprupvc', 'akshaya-upvc', 'venkateshwara-upvc-windows-doors'];

async function main() {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  
  try {
    console.log('=== Checking clients table ===\n');
    
    // Get all clients
    const allResult = await client.query(
      `SELECT id, password_hash, config->>'portalPasswordHash' as cfg_hash, 
              config->>'companyName' as company_name, config->>'appName' as app_name,
              config->>'adminEmails' as admin_emails, is_active, trial_expires_at
       FROM clients ORDER BY id`
    );
    
    console.log(`Total clients in DB: ${allResult.rows.length}`);
    console.log('---');
    
    for (const row of allResult.rows) {
      console.log(`\nClient: ${row.id}`);
      console.log(`  Company: ${row.company_name || 'N/A'}`);
      console.log(`  App Name: ${row.app_name || 'N/A'}`);
      console.log(`  Admin Emails: ${row.admin_emails || 'N/A'}`);
      console.log(`  Is Active: ${row.is_active}`);
      console.log(`  Trial Expires: ${row.trial_expires_at || 'N/A'}`);
      console.log(`  password_hash (column): ${row.password_hash ? 'SET (' + row.password_hash.substring(0, 20) + '...)' : 'NULL'}`);
      console.log(`  cfg portalPasswordHash: ${row.cfg_hash ? 'SET (' + row.cfg_hash.substring(0, 20) + '...)' : 'NULL'}`);
    }
    
    console.log('\n\n=== Checking target clients ===\n');
    
    for (const target of TARGET_CLIENTS) {
      const found = allResult.rows.find(r => r.id === target);
      if (found) {
        console.log(`✓ '${target}' EXISTS`);
      } else {
        console.log(`✗ '${target}' NOT FOUND`);
      }
    }
    
    // Check client_public view
    console.log('\n\n=== Checking client_public view ===\n');
    try {
      const viewResult = await client.query(`SELECT id FROM client_public ORDER BY id`);
      console.log(`client_public view rows: ${viewResult.rows.length}`);
      for (const row of viewResult.rows) {
        console.log(`  - ${row.id}`);
      }
    } catch (e) {
      console.log(`client_public view error: ${e.message}`);
    }
    
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
