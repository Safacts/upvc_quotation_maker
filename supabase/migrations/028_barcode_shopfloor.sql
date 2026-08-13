-- ============================================================================
-- 028_barcode_shopfloor.sql
-- Barcode scanning & shop floor tracking for UPVC manufacturing.
-- Tables: orders, production_orders, barcodes, shopfloor_updates
-- ============================================================================

-- Orders: links a customer quotation to manufacturing
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  contact_no text DEFAULT '',
  order_no text,
  status text NOT NULL DEFAULT 'confirmed',
  total_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(client_id, status);

-- Production orders: individual line items within an order, each tracked through stages
CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_description text NOT NULL DEFAULT '',
  quantity numeric DEFAULT 0,
  unit text DEFAULT 'nos',
  stage text NOT NULL DEFAULT 'cutting',
  priority integer DEFAULT 0,
  due_date date,
  assigned_to text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_orders_client ON public.production_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_order ON public.production_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_stage ON public.production_orders(client_id, stage);

-- Barcodes: one barcode per production order, scanned at each stage transition
CREATE TABLE IF NOT EXISTS public.barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  production_order_id uuid REFERENCES production_orders(id) ON DELETE SET NULL,
  barcode_value text NOT NULL UNIQUE,
  stage text NOT NULL DEFAULT 'cutting',
  scanned_at timestamptz,
  scanned_by text,
  location text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_barcodes_client ON public.barcodes(client_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_value ON public.barcodes(barcode_value);
CREATE INDEX IF NOT EXISTS idx_barcodes_prod_order ON public.barcodes(production_order_id);

-- Shop floor updates: real-time feed of stage changes, status updates, worker activity
CREATE TABLE IF NOT EXISTS public.shopfloor_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  production_order_id uuid NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  worker_id text,
  notes text,
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopfloor_client ON public.shopfloor_updates(client_id);
CREATE INDEX IF NOT EXISTS idx_shopfloor_prod_order ON public.shopfloor_updates(production_order_id);
CREATE INDEX IF NOT EXISTS idx_shopfloor_timestamp ON public.shopfloor_updates(client_id, timestamp DESC);

-- RLS: tenant isolation
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopfloor_updates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY client_isolation ON public.orders
    USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_isolation ON public.production_orders
    USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_isolation ON public.barcodes
    USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_isolation ON public.shopfloor_updates
    USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
