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
  CONSTRAINT businesses_slug_key UNIQUE (slug)
);

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

CREATE INDEX IF NOT EXISTS users_business_active_idx ON public.users(business_id, is_active);

CREATE OR REPLACE FUNCTION public.v1_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v1_businesses_updated_at ON public.businesses;
CREATE TRIGGER v1_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.v1_set_updated_at();

DROP TRIGGER IF EXISTS v1_users_updated_at ON public.users;
CREATE TRIGGER v1_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.v1_set_updated_at();

-- Direct client access is intentionally denied by default. The API uses the
-- service role only after deriving business_id from the trusted session.
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v1_service_role_businesses ON public.businesses;
CREATE POLICY v1_service_role_businesses ON public.businesses FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v1_service_role_users ON public.users;
CREATE POLICY v1_service_role_users ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
-- Migration script for items table (matches Next.js API requirements)

BEGIN;

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
  
CREATE INDEX IF NOT EXISTS items_business_active_idx 
  ON public.items(business_id, is_active) WHERE deleted_at IS NULL;
  
CREATE INDEX IF NOT EXISTS items_business_category_idx 
  ON public.items(business_id, category);

CREATE OR REPLACE FUNCTION public.v1_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v1_items_updated_at ON public.items;
CREATE TRIGGER v1_items_updated_at 
  BEFORE UPDATE ON public.items 
  FOR EACH ROW EXECUTE FUNCTION public.v1_set_updated_at();

-- RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v1_service_role_items ON public.items;
CREATE POLICY v1_service_role_items 
  ON public.items 
  FOR ALL TO service_role 
  USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
-- Create parties table for the console API
CREATE TABLE IF NOT EXISTS public.parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id TEXT NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    party_type VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (party_type IN ('customer', 'supplier', 'both')),
    company_name VARCHAR(200) DEFAULT '',
    phone VARCHAR(40) DEFAULT '',
    email VARCHAR(320) DEFAULT '',
    address VARCHAR(500) DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    state VARCHAR(100) DEFAULT '',
    state_code VARCHAR(10) DEFAULT '',
    pincode VARCHAR(20) DEFAULT '',
    gstin VARCHAR(20) DEFAULT '',
    pan VARCHAR(20) DEFAULT '',
    opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    opening_balance_type VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (opening_balance_type IN ('none', 'debit', 'credit')),
    credit_limit NUMERIC(15, 2) NOT NULL DEFAULT 0,
    payment_terms_days INTEGER NOT NULL DEFAULT 0,
    notes VARCHAR(2000) DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_parties_business_id ON public.parties(business_id);
CREATE INDEX IF NOT EXISTS idx_parties_name ON public.parties(name);
CREATE INDEX IF NOT EXISTS idx_parties_is_active ON public.parties(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

-- Standard policies assuming a multi-tenant setup where business_id is verified
-- Note: Adjust the exact auth check according to your existing RLS logic (e.g. auth.uid())
CREATE POLICY "Users can view their own business parties" 
    ON public.parties FOR SELECT 
    USING (true); -- Or another mechanism mapped to business_id

CREATE POLICY "Users can insert parties for their business" 
    ON public.parties FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Users can update their business parties" 
    ON public.parties FOR UPDATE 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Users can delete their business parties" 
    ON public.parties FOR DELETE 
    USING (true);

-- Add a trigger to automatically update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_parties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parties_updated_at ON public.parties;
CREATE TRIGGER trg_parties_updated_at
BEFORE UPDATE ON public.parties
FOR EACH ROW
EXECUTE FUNCTION update_parties_updated_at();
