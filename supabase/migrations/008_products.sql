-- Phase 0 Migration 008 — `products` table
-- Master data for the desktop dashboard (product catalogue, rate cards, etc.)
--
-- Idempotent — safe to re-run. Apply via the pooler
-- (aws-1-ap-south-1.pooler.supabase.com:5432, user postgres.effxrwrbsjduvhmorvrq),
-- then run: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text NOT NULL DEFAULT 'venkateshwara',
  name        text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price       numeric NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT 'SFT',
  soft_deleted boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_client_id     ON products(client_id);
CREATE INDEX IF NOT EXISTS idx_products_name          ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category      ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_soft_deleted  ON products(soft_deleted);

-- RLS — same pattern as customers / quotations
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop then create (idempotent re-run support)
DROP POLICY IF EXISTS "Allow public all on products" ON products;
CREATE POLICY "Allow public all on products"
    ON products
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on products" ON products;
CREATE POLICY "Allow service_role full access on products"
    ON products
    USING (auth.role() = 'service_role');

-- client_isolation (defense-in-depth)
DROP POLICY IF EXISTS "client_isolation_products" ON products;
CREATE POLICY "client_isolation_products"
    ON products
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_products ON products;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_products
      BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
