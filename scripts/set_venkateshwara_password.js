#!/usr/bin/env node
/**
 * Set Venkateshwara client portal password
 * Updates password_hash in clients table for client_id = 'kprupvc'
 * on both Production and Staging databases
 */

const { Pool } = require('pg');
require('dotenv').config();
const bcrypt = require('bcrypt');

const NEW_PASSWORD = 'Jvenkatesh@1234';
const CLIENT_ID = 'kprupvc';
const BCRYPT_COST = 10;

// Database configurations
const PROD_DB = {
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.gumpmnbjdtzajhysnnaz',
  password: process.env.SUPABASE_DB_PASSWORD,  // from .env, never hardcoded
  ssl: { rejectUnauthorized: false }
};

const STAGING_DB = {
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.effxrwrbsjduvhmorvrq',
  password: process.env.SUPABASE_DB_PASSWORD,  // from .env, never hardcoded
  ssl: { rejectUnauthorized: false }
};

async function hashPassword(password) {
  return await bcrypt.hash(password, BCRYPT_COST);
}

async function verifyHash(password, hash) {
  return await bcrypt.compare(password, hash);
}

async function updateClientPassword(dbConfig, label) {
  console.log(`\n=== ${label} Database ===`);
  console.log(`Host: ${dbConfig.host}`);
  
  const pool = new Pool(dbConfig);
  
  try {
    // Test connection
    const testResult = await pool.query('SELECT version()');
    console.log(`✓ Connected: ${testResult.rows[0].version.split(' ')[0]} ${testResult.rows[0].version.split(' ')[1]}`);
    
    // Hash the password
    const passwordHash = await hashPassword(NEW_PASSWORD);
    console.log(`✓ Password hashed (bcrypt cost ${BCRYPT_COST})`);
    console.log(`  Hash: ${passwordHash}`);
    
    // Verify hash works
    const verifyResult = await verifyHash(NEW_PASSWORD, passwordHash);
    console.log(`✓ Hash verification: ${verifyResult ? 'PASS' : 'FAIL'}`);
    
    // Check current client exists
    const clientCheck = await pool.query(
      'SELECT id, config->>\'companyName\' as company_name, password_hash FROM clients WHERE id = $1',
      [CLIENT_ID]
    );
    
    if (clientCheck.rows.length === 0) {
      console.log(`✗ Client '${CLIENT_ID}' not found!`);
      return false;
    }
    
    const client = clientCheck.rows[0];
    console.log(`✓ Found client: ${client.company_name} (id: ${client.id})`);
    console.log(`  Current password_hash: ${client.password_hash ? 'SET' : 'NULL'}`);
    
    // Update the password_hash
    const updateResult = await pool.query(
      'UPDATE clients SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, password_hash',
      [passwordHash, CLIENT_ID]
    );
    
    if (updateResult.rows.length === 0) {
      console.log(`✗ Update failed - no rows affected`);
      return false;
    }
    
    console.log(`✓ Password updated successfully`);
    console.log(`  Updated client: ${updateResult.rows[0].id}`);
    
    // Verify the update by reading back
    const verifyRead = await pool.query(
      'SELECT password_hash FROM clients WHERE id = $1',
      [CLIENT_ID]
    );
    
    if (verifyRead.rows.length > 0) {
      const storedHash = verifyRead.rows[0].password_hash;
      const verifyMatch = await verifyHash(NEW_PASSWORD, storedHash);
      console.log(`✓ Read-back verification: ${verifyMatch ? 'PASS' : 'FAIL'}`);
      
      if (!verifyMatch) {
        console.log(`✗ CRITICAL: Stored hash does not match password!`);
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    console.error(error);
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Set Venkateshwara Client Portal Password                       ║');
  console.log('║  Client: kprupvc (Venkateshwara UPVC Windows & Doors)           ║');
  console.log('║  Email: jvenkateshupvc@gmail.com                                 ║');
  console.log('║  Password: Jvenkatesh@1234                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const prodResult = await updateClientPassword(PROD_DB, 'PRODUCTION');
  const stagingResult = await updateClientPassword(STAGING_DB, 'STAGING');
  
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                         ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Production:  ${prodResult ? '✓ SUCCESS' : '✗ FAILED'}                                    ║`);
  console.log(`║  Staging:     ${stagingResult ? '✓ SUCCESS' : '✗ FAILED'}                                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  if (prodResult && stagingResult) {
    console.log('\n✅ All databases updated successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Some databases failed to update!');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});