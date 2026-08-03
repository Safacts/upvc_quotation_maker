-- Part 9: Secure auth - move password hash to column, create client_public view, revoke anon access

-- 1. Add password_hash column to clients table (if not exists)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Backfill password_hash from config.portalPasswordHash
UPDATE clients
SET password_hash = (config->>'portalPasswordHash')
WHERE config ? 'portalPasswordHash' AND password_hash IS NULL;

-- 3. Strip portalPasswordHash from config for all clients
UPDATE clients
SET config = config - 'portalPasswordHash'
WHERE config ? 'portalPasswordHash';

-- 4. Create client_public view (excludes password_hash)
CREATE OR REPLACE VIEW client_public AS
SELECT
  id,
  config,
  trial_expires_at,
  is_active,
  created_at,
  updated_at
FROM clients
WHERE is_active = true;

-- 5. Grant access to client_public for anon/authenticated
GRANT SELECT ON client_public TO anon, authenticated;

-- 6. Revoke all on clients table from anon/authenticated
REVOKE ALL ON clients FROM anon, authenticated;
REVOKE ALL ON admins FROM anon, authenticated;

-- 7. Enable RLS on clients and admins (if not already)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for service_role only (full access)
-- Note: service_role bypasses RLS by default, but explicit policies don't hurt
CREATE POLICY "service_role full access clients" ON clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access admins" ON admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. Create sent_emails table if not exists (for OTP logging)
CREATE TABLE IF NOT EXISTS sent_emails (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  client_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sent_emails FROM anon, authenticated;
GRANT ALL ON sent_emails TO service_role;

-- 10. Verify: anon should not read clients/admins, but can read client_public
-- Test queries (run manually to verify):
-- SET ROLE anon;
-- SELECT * FROM clients LIMIT 1;        -- should fail (401)
-- SELECT * FROM admins LIMIT 1;         -- should fail (401)
-- SELECT * FROM client_public LIMIT 1;  -- should succeed (200, no password_hash)
-- RESET ROLE;