-- V1 Foundation: business, users, parties, items, units and taxes.
-- Tenant key deliberately remains text to match the existing clients table and
-- the current application/session contract.  All business-owned rows carry
-- business_id and are protected by RLS; server routes must still apply the
-- trusted-session tenant filter when using the service role.

BEGIN;

CREATE TABLE IF NOT EXISTS public.businesses (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  legal_name text NOT NULL DEFAULT '',
  slug text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_slug_key UNIQUE (slug),
  CONSTRAINT businesses_clients_fk FOREIGN KEY (id) REFERENCES public.clients(id) ON DELETE CASCADE
);

-- Preserve existing tenants when this migration is applied to the current app.
INSERT INTO public.businesses (id, name, slug, is_active, created_at, updated_at)
SELECT c.id, COALESCE(NULLIF(c.config->>'business_name', ''), c.id), c.id,
       COALESCE(c.is_active, true), COALESCE(c.created_at, now()), COALESCE(c.updated_at, now())
FROM public.clients c
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  auth_user_id uuid NULL,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'salesperson',
  phone text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('owner', 'manager', 'accountant', 'salesperson')),
  CONSTRAINT users_business_email_key UNIQUE (business_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  party_type text NOT NULL DEFAULT 'customer',
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance_type text NOT NULL DEFAULT 'none',
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  payment_terms_days integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parties_type_check CHECK (party_type IN ('customer', 'supplier', 'both')),
  CONSTRAINT parties_balance_type_check CHECK (opening_balance_type IN ('none', 'debit', 'credit')),
  CONSTRAINT parties_terms_check CHECK (payment_terms_days >= 0),
  CONSTRAINT parties_credit_limit_check CHECK (credit_limit >= 0)
);

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  decimal_places smallint NOT NULL DEFAULT 2,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_decimal_places_check CHECK (decimal_places BETWEEN 0 AND 6),
  CONSTRAINT units_scope_check CHECK ((is_system AND business_id IS NULL) OR (NOT is_system AND business_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS units_system_code_key ON public.units(code) WHERE business_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS units_business_code_key ON public.units(business_id, code) WHERE business_id IS NOT NULL;

INSERT INTO public.units (code, name, symbol, decimal_places, is_system)
VALUES
  ('PCS', 'Pieces', 'pcs', 0, true),
  ('SFT', 'Square feet', 'sq ft', 2, true),
  ('SQM', 'Square metre', 'm2', 2, true),
  ('MTR', 'Metre', 'm', 3, true),
  ('KG', 'Kilogram', 'kg', 3, true),
  ('NOS', 'Numbers', 'nos', 0, true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_type text NOT NULL DEFAULT 'gst',
  cgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  sgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  igst_rate numeric(5,2) NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taxes_scope_check CHECK ((is_system AND business_id IS NULL) OR (NOT is_system AND business_id IS NOT NULL)),
  CONSTRAINT taxes_type_check CHECK (tax_type IN ('gst', 'igst', 'exempt', 'none')),
  CONSTRAINT taxes_rate_check CHECK (rate BETWEEN 0 AND 100),
  CONSTRAINT taxes_components_check CHECK (cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS taxes_system_code_key ON public.taxes(code) WHERE business_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS taxes_business_code_key ON public.taxes(business_id, code) WHERE business_id IS NOT NULL;

INSERT INTO public.taxes (name, code, rate, cgst_rate, sgst_rate, igst_rate, is_system)
VALUES
  ('GST 0%', 'GST0', 0, 0, 0, 0, true),
  ('GST 5%', 'GST5', 5, 2.5, 2.5, 5, true),
  ('GST 12%', 'GST12', 12, 6, 6, 12, true),
  ('GST 18%', 'GST18', 18, 9, 9, 18, true),
  ('GST 28%', 'GST28', 28, 14, 14, 28, true),
  ('Exempt', 'EXEMPT', 0, 0, 0, 0, true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sku text NOT NULL DEFAULT '',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  item_type text NOT NULL DEFAULT 'product',
  unit_id uuid NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  tax_id uuid NULL REFERENCES public.taxes(id) ON DELETE RESTRICT,
  hsn_code text NOT NULL DEFAULT '',
  selling_price numeric(14,2) NOT NULL DEFAULT 0,
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  profile_system text NOT NULL DEFAULT '',
  colour text NOT NULL DEFAULT '',
  glass_specification text NOT NULL DEFAULT '',
  reinforcement text NOT NULL DEFAULT '',
  frame_series text NOT NULL DEFAULT '',
  fabrication_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_type_check CHECK (item_type IN ('product', 'service', 'raw_material', 'finished_good')),
  CONSTRAINT items_prices_check CHECK (selling_price >= 0 AND purchase_price >= 0),
  CONSTRAINT items_min_stock_check CHECK (min_stock >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS items_business_sku_key
  ON public.items(business_id, sku) WHERE sku <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS parties_business_active_idx ON public.parties(business_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS parties_business_name_idx ON public.parties(business_id, lower(name));
CREATE INDEX IF NOT EXISTS items_business_active_idx ON public.items(business_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_business_category_idx ON public.items(business_id, category);
CREATE INDEX IF NOT EXISTS users_business_active_idx ON public.users(business_id, is_active);

CREATE OR REPLACE FUNCTION public.v1_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','users','parties','units','taxes','items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'v1_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v1_set_updated_at()', 'v1_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- Direct client access is intentionally denied by default. The API uses the
-- service role only after deriving business_id from the trusted session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','users','parties','units','taxes','items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v1_service_role_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'v1_service_role_' || t, t);
  END LOOP;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
