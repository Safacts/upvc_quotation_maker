import psycopg2
import os

SUPABASE_DB_PASSWORD = os.environ['SUPABASE_DB_PASSWORD']
DB_URL = f"postgresql://postgres:{SUPABASE_DB_PASSWORD}@db.effxrwrbsjduvhmorvrq.supabase.co:5432/postgres"

SQL = """
-- 1. Add password_hash column
ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Backfill from config.portalPasswordHash
UPDATE clients
SET password_hash = (config->>'portalPasswordHash')
WHERE config ? 'portalPasswordHash' AND password_hash IS NULL;

-- 3. Strip portalPasswordHash from config
UPDATE clients
SET config = config - 'portalPasswordHash'
WHERE config ? 'portalPasswordHash';

-- 4. Create client_public view (excludes password_hash)
CREATE OR REPLACE VIEW client_public AS
SELECT id, config, trial_expires_at, is_active, created_at, updated_at
FROM clients WHERE is_active = true;

-- 5. Grant access to client_public for anon/authenticated
GRANT SELECT ON client_public TO anon, authenticated;

-- 6. Revoke all on clients/admins from anon/authenticated
REVOKE ALL ON clients FROM anon, authenticated;
REVOKE ALL ON admins FROM anon, authenticated;

-- 7. Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 8. Service role policies
CREATE POLICY "service_role full access clients" ON clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access admins" ON admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. sent_emails table
CREATE TABLE IF NOT EXISTS sent_emails (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL, subject TEXT, body TEXT, client_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sent_emails FROM anon, authenticated;
GRANT ALL ON sent_emails TO service_role;
"""

conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

for stmt in SQL.strip().split(';'):
    stmt = stmt.strip()
    if stmt and not stmt.startswith('--'):
        try:
            cur.execute(stmt + ';')
            print(f"OK: {stmt[:60]}...")
        except Exception as e:
            print(f"FAIL: {stmt[:60]}... -> {e}")

cur.close()
conn.close()
print("Migration complete. Verifying...")

# Verify
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Check column exists
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND column_name='password_hash';")
print(f"password_hash column: {cur.fetchone()}")

# Check view exists
cur.execute("SELECT * FROM client_public LIMIT 1;")
row = cur.fetchone()
print(f"client_public view: {'OK' if row else 'EMPTY'}")

# Check no password_hash in view
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='client_public';")
cols = [r[0] for r in cur.fetchall()]
print(f"client_public columns: {cols}")
print(f"password_hash in view: {'password_hash' in cols}")

# Check RLS
cur.execute("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('clients', 'admins');")
for r in cur.fetchall():
    print(f"RLS {r[0]}: {r[1]}")

cur.close()
conn.close()