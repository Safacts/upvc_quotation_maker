-- Phase 0 Migration 007 â€” `customers` table
-- Master data for the desktop dashboard (Customer Ledger, dropdowns, etc.)
--
-- Columns match the existing `quotations` free-text fields (customer_name, contact_no,
-- email, address) so backfill is a straight INSERT...SELECT DISTINCT.
--
-- Idempotent â€” safe to re-run. Apply via the pooler
-- (aws-1-ap-south-1.pooler.supabase.com:5432, user postgres.gumpmnbjdtzajhysnnaz),
-- then run: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text NOT NULL DEFAULT 'venkateshwara',
  name        text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  company     text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  gst_number  text NOT NULL DEFAULT '',
  soft_deleted boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_client_id      ON customers(client_id);
CREATE INDEX IF NOT EXISTS idx_customers_name           ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_soft_deleted   ON customers(soft_deleted);

-- Unique: one customer per client with a given phone (only for non-deleted, non-empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_client_phone
  ON customers(client_id, phone)
  WHERE phone <> '' AND soft_deleted = false;

-- RLS â€” same pattern as quotations / measured_items / unmeasured_items
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Drop then create (idempotent re-run support)
DROP POLICY IF EXISTS "Allow public all on customers" ON customers;
CREATE POLICY "Allow public all on customers"
    ON customers
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on customers" ON customers;
CREATE POLICY "Allow service_role full access on customers"
    ON customers
    USING (auth.role() = 'service_role');

-- Existing client_isolation policy pattern (defense-in-depth for the REST API)
DROP POLICY IF EXISTS "client_isolation_customers" ON customers;
CREATE POLICY "client_isolation_customers"
    ON customers
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- updated_at trigger (reuse existing function if present, else no-op)
DROP TRIGGER IF EXISTS set_updated_at_customers ON customers;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_customers
      BEFORE UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
