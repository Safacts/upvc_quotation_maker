import psycopg2
import os

SUPABASE_DB_PASSWORD = os.environ['SUPABASE_DB_PASSWORD']
DB_URL = f"postgresql://postgres:{SUPABASE_DB_PASSWORD}@db.gumpmnbjdtzajhysnnaz.supabase.co:5432/postgres"

SQL = """
ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
CHECK (status IN ('draft', 'sent', 'won', 'lost'));

-- To alter a view, we actually need to recreate it if we are adding a column to the underlying table that the view needs. 
-- Wait, the client_public view is defined as:
-- CREATE OR REPLACE VIEW client_public AS
-- SELECT id, config, trial_expires_at, is_active, created_at, updated_at FROM clients WHERE is_active = true;
-- The user asked to add cost_margin_percent to client_public. But client_public is a view.
-- The underlying table is clients. Let's add it to clients, then update the view!
"""

conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

# 1. Add status to quotations
try:
    cur.execute("""
        ALTER TABLE quotations
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'won', 'lost'));
    """)
    print("OK: Added status to quotations")
except Exception as e:
    print(f"FAIL: quotations status -> {e}")

# 2. Add cost_margin_percent to clients
try:
    cur.execute("""
        ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS cost_margin_percent NUMERIC DEFAULT 65;
    """)
    print("OK: Added cost_margin_percent to clients")
except Exception as e:
    print(f"FAIL: clients cost_margin_percent -> {e}")

# 3. Update client_public view to include cost_margin_percent
try:
    cur.execute("""
        CREATE OR REPLACE VIEW client_public AS
        SELECT id, config, trial_expires_at, is_active, created_at, updated_at, cost_margin_percent
        FROM clients WHERE is_active = true;
    """)
    print("OK: Updated client_public view")
except Exception as e:
    print(f"FAIL: client_public view -> {e}")

cur.close()
conn.close()
print("Dashboard schema migration complete.")
