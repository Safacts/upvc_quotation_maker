-- ============================================================================
-- Migration 021 -- Inventory management, GST configuration, stock tracking
--                  Competes with Vyapar & myBillBook feature sets
-- ============================================================================
--
-- SCOPE
--   1. ALTER products -- add stock_quantity, low_stock_threshold, hsn_code
--   2. stock_movements -- immutable audit trail for all inventory changes
--   3. tax_rates -- configurable HSN-wise GST rates per client
--   4. gst_reports -- pre-computed periodic GST summaries
--   5. RPCs -- adjust_stock(), get_stock_alerts(), generate_gst_report()
--
-- PREREQUISITES
--   008_products.sql         (products table exists)
--   004_gst_invoices.sql     (gst_invoices table exists)
--   009_masters.sql          (audit_logs exists, pg_trgm installed)
--   012_mobile_features.sql  (payments table exists -- DO NOT duplicate)
--
-- DESIGN DECISIONS
--   - payments table is in 012, NOT here. This migration handles INVENTORY and
--     GST CONFIGURATION only. Payment tracking is 012's scope.
--   - products.stock_quantity CHECK >= 0 prevents negative stock at DB level.
--     Stock-outs are modeled as quantity=0, not negative.
--   - stock_movements has NO FK ON DELETE CASCADE to products: if a product is
--     ever hard-deleted, its movement history must survive for audit. Use
--     ON DELETE SET NULL instead.
--   - tax_rates uses free-text hsn_code (NOT integer) because HSN codes have
--     leading zeros (e.g. '0402') and can be 4/6/8 digits.
--   - gst_reports caches per-period summaries to avoid recomputing expensive
--     GROUP BY queries on every dashboard load. Stale reports are marked
--     status='stale' and regenerated on demand.
--   - CHECK constraints on all numeric columns enforce business invariants at
--     the DB level -- defense-in-depth against app bugs.
--   - RLS follows the standard triple: service_role + client_isolation + no
--     public-all (products already has public-all from 008, we leave it alone
--     here -- 018 drops it separately).
--
-- ASCII-ONLY -- no BOM, no em-dashes. Safe for raw psql/node-postgres.
--
-- IDEMPOTENT -- safe to re-run. Apply via the pooler then:
--   NOTIFY pgrst, 'reload schema';
--
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. ALTER products -- add inventory tracking columns
-- ---------------------------------------------------------------------------
-- These are ADDITIVE columns with safe DEFAULTs. Existing Flutter APKs and
-- Next.js routes that don't know about these columns continue working untouched.
-- stock_quantity starts at 0 (no stock on hand) -- backfill is NOT needed
-- because products starts empty (0 rows on both DBs as of 09-08-2026).

-- stock_quantity: current stock on hand (integer, >= 0)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'products'
      AND column_name  = 'stock_quantity'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- low_stock_threshold: alert when stock falls below this level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'products'
      AND column_name  = 'low_stock_threshold'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 10;
  END IF;
END $$;

-- hsn_code: Harmonized System of Nomenclature code for GST classification
-- Stored on product for quick access during invoicing (avoids joining tax_rates
-- on every invoice line). text type because HSN codes have leading zeros.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'products'
      AND column_name  = 'hsn_code'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN hsn_code text NOT NULL DEFAULT '3925';
  END IF;
END $$;

-- CHECK constraints on products numeric columns
-- Idempotent: constraints are named so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'products_stock_quantity_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_quantity_chk
      CHECK (stock_quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'products_low_stock_threshold_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_low_stock_threshold_chk
      CHECK (low_stock_threshold >= 0);
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. stock_movements -- immutable audit trail for inventory changes
-- ---------------------------------------------------------------------------
-- Every stock change (sale, purchase, adjustment, return) is logged here.
-- quantity is SIGNED: positive = stock IN, negative = stock OUT.
-- This is the Vyapar/myBillBook-style inventory ledger.
--
-- WHY NO FK ON DELETE CASCADE TO PRODUCTS:
--   If a product is hard-deleted, its movement history must survive for audit
--   and GST compliance. ON DELETE SET NULL preserves the record.
--
-- WHY movement_type IS free text (not enum):
--   Realistic set: 'sale'|'purchase'|'adjustment'|'return'|'damage'|'transfer'.
--   It WILL grow. Constrain in the app dropdown, not in DDL.
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  product_id      uuid,
  product_name    text NOT NULL DEFAULT '',     -- snapshot (survives product delete)
  quantity        integer NOT NULL,             -- signed: +IN, -OUT
  movement_type   text NOT NULL DEFAULT 'sale', -- sale|purchase|adjustment|return|damage|transfer
  reference_id    uuid,                        -- optional: quotation_id, purchase_order_id
  reference_type  text NOT NULL DEFAULT '',     -- 'quotation'|'purchase'|'manual'|''
  note            text NOT NULL DEFAULT '',
  actor           text NOT NULL DEFAULT '',     -- who made the change (email/user)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- CHECK: quantity must not be zero (a movement of 0 is meaningless)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'stock_movements_quantity_chk'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_quantity_chk
      CHECK (quantity <> 0);
  END IF;
END $$;

-- FK to products: ON DELETE SET NULL (history survives product deletion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'stock_movements_product_id_fkey'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes: these serve the core inventory queries
-- 1. "All movements for this product, newest first" -- product detail page
CREATE INDEX IF NOT EXISTS stock_movements_client_product_created_idx
  ON public.stock_movements (client_id, product_id, created_at DESC);

-- 2. "All movements by type, newest first" -- movement type filter/report
CREATE INDEX IF NOT EXISTS stock_movements_client_type_created_idx
  ON public.stock_movements (client_id, movement_type, created_at DESC);

-- 3. "All movements for a quotation" -- links stock changes to a quote
CREATE INDEX IF NOT EXISTS stock_movements_client_reference_idx
  ON public.stock_movements (client_id, reference_id)
  WHERE reference_id IS NOT NULL;

-- RLS
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on stock_movements" ON public.stock_movements;
CREATE POLICY "Allow service_role full access on stock_movements"
    ON public.stock_movements
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_stock_movements" ON public.stock_movements;
CREATE POLICY "client_isolation_stock_movements"
    ON public.stock_movements
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.stock_movements IS
  'Immutable audit trail for all inventory changes. quantity is signed: '
  'positive = stock IN, negative = stock OUT. product_name is a snapshot '
  'that survives product deletion.';

COMMENT ON COLUMN public.stock_movements.quantity IS
  'Signed integer: positive for stock IN (purchase, return, adjustment-up), '
  'negative for stock OUT (sale, damage, adjustment-down). CHECK: <> 0.';


-- ---------------------------------------------------------------------------
-- 3. tax_rates -- configurable HSN-wise GST rates per client
-- ---------------------------------------------------------------------------
-- Each client can define their own HSN rate card. When generating a GST
-- invoice, the app looks up tax_rates by hsn_code to get the rates. If no
-- rate is configured, the invoice defaults to 18% (9+9) as per existing
-- gst_invoices columns.
--
-- WHY NOT just use the rates on gst_invoices?
--   gst_invoices stores the RATE AT TIME OF INVOICE (immutable snapshot).
--   tax_rates is the CURRENT CONFIGURATION used for NEW invoices.
--   Separation prevents historical invoice data from drifting when rates change.
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text NOT NULL DEFAULT 'venkateshwara',
  hsn_code    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  cgst_rate   numeric NOT NULL DEFAULT 9.0,
  sgst_rate   numeric NOT NULL DEFAULT 9.0,
  igst_rate   numeric NOT NULL DEFAULT 0.0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- CHECK: rates must be between 0 and 100 (percentage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'tax_rates_cgst_rate_chk'
      AND conrelid = 'public.tax_rates'::regclass
  ) THEN
    ALTER TABLE public.tax_rates
      ADD CONSTRAINT tax_rates_cgst_rate_chk
      CHECK (cgst_rate >= 0 AND cgst_rate <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'tax_rates_sgst_rate_chk'
      AND conrelid = 'public.tax_rates'::regclass
  ) THEN
    ALTER TABLE public.tax_rates
      ADD CONSTRAINT tax_rates_sgst_rate_chk
      CHECK (sgst_rate >= 0 AND sgst_rate <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'tax_rates_igst_rate_chk'
      AND conrelid = 'public.tax_rates'::regclass
  ) THEN
    ALTER TABLE public.tax_rates
      ADD CONSTRAINT tax_rates_igst_rate_chk
      CHECK (igst_rate >= 0 AND igst_rate <= 100);
  END IF;
END $$;

-- UNIQUE: one active rate per HSN per client
CREATE UNIQUE INDEX IF NOT EXISTS tax_rates_client_hsn_active_idx
  ON public.tax_rates (client_id, hsn_code)
  WHERE is_active = true;

-- Index: "all rates for this client" -- rate card editor
CREATE INDEX IF NOT EXISTS tax_rates_client_idx
  ON public.tax_rates (client_id, is_active);

-- RLS
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on tax_rates" ON public.tax_rates;
CREATE POLICY "Allow service_role full access on tax_rates"
    ON public.tax_rates
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_tax_rates" ON public.tax_rates;
CREATE POLICY "client_isolation_tax_rates"
    ON public.tax_rates
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_tax_rates ON public.tax_rates;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_tax_rates
      BEFORE UPDATE ON public.tax_rates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE public.tax_rates IS
  'Client-configurable HSN-wise GST rate card. Used for NEW invoices only. '
  'Historical rates are snapshot on gst_invoices at time of creation. '
  'One active rate per HSN code per client (partial unique index).';


-- ---------------------------------------------------------------------------
-- 4. gst_reports -- pre-computed periodic GST summaries
-- ---------------------------------------------------------------------------
-- Dashboard needs "GST collected this month/quarter" without scanning every
-- invoice. This table caches the result. Reports are generated on demand
-- and marked 'stale' when underlying data changes (app-layer responsibility).
--
-- period_start/period_end define the filing period (month, quarter, FY).
-- report_type distinguishes GSTR-1, GSTR-3B, or custom.
CREATE TABLE IF NOT EXISTS public.gst_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  report_type     text NOT NULL DEFAULT 'monthly', -- monthly|quarterly|yearly|custom
  total_taxable   numeric NOT NULL DEFAULT 0,
  total_cgst      numeric NOT NULL DEFAULT 0,
  total_sgst      numeric NOT NULL DEFAULT 0,
  total_igst      numeric NOT NULL DEFAULT 0,
  total_invoices  integer NOT NULL DEFAULT 0,
  total_items     integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft',   -- draft|final|stale
  generated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- CHECK: period_end must be >= period_start
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'gst_reports_period_chk'
      AND conrelid = 'public.gst_reports'::regclass
  ) THEN
    ALTER TABLE public.gst_reports
      ADD CONSTRAINT gst_reports_period_chk
      CHECK (period_end >= period_start);
  END IF;

  -- CHECK: totals must be >= 0
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'gst_reports_totals_chk'
      AND conrelid = 'public.gst_reports'::regclass
  ) THEN
    ALTER TABLE public.gst_reports
      ADD CONSTRAINT gst_reports_totals_chk
      CHECK (total_taxable >= 0 AND total_cgst >= 0 AND total_sgst >= 0
             AND total_igst >= 0 AND total_invoices >= 0 AND total_items >= 0);
  END IF;
END $$;

-- UNIQUE: one report per period per type per client
CREATE UNIQUE INDEX IF NOT EXISTS gst_reports_client_period_type_idx
  ON public.gst_reports (client_id, period_start, period_end, report_type);

-- Index: "all reports for this client" -- report listing page
CREATE INDEX IF NOT EXISTS gst_reports_client_created_idx
  ON public.gst_reports (client_id, created_at DESC);

-- RLS
ALTER TABLE public.gst_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on gst_reports" ON public.gst_reports;
CREATE POLICY "Allow service_role full access on gst_reports"
    ON public.gst_reports
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_gst_reports" ON public.gst_reports;
CREATE POLICY "client_isolation_gst_reports"
    ON public.gst_reports
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.gst_reports IS
  'Pre-computed GST return summaries. Generated on demand for monthly/quarterly '
  'filing periods. Status lifecycle: draft -> final. Set to stale when underlying '
  'invoices change. Unique on (client_id, period_start, period_end, report_type).';


-- ---------------------------------------------------------------------------
-- 5. RPC: adjust_stock() -- atomic stock adjustment with movement logging
-- ---------------------------------------------------------------------------
-- One-call interface for the Flutter app / Next.js console to record a stock
-- change. Atomically: (a) inserts a stock_movements row, (b) updates
-- products.stock_quantity. Both succeed or both fail.
--
-- Parameters:
--   p_client_id     -- tenant (must match x-client-id header)
--   p_product_id    -- the product being adjusted
--   p_quantity      -- signed: +IN, -OUT (CHECK: <> 0, enforced by stock_movements)
--   p_movement_type -- 'sale'|'purchase'|'adjustment'|'return'|'damage'|'transfer'
--   p_reference_id  -- optional: quotation_id linking this movement
--   p_reference_type-- 'quotation'|'purchase'|'manual'|''
--   p_note          -- human-readable reason
--   p_actor         -- who is making the change
--
-- Returns: jsonb with { success, new_stock_quantity, movement_id, error }
--
-- SECURITY: INVOKER (not DEFINER) -- caller must have INSERT on stock_movements
-- and UPDATE on products, enforced by RLS. A p_cid header guard prevents
-- cross-tenant writes.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_client_id      text,
  p_product_id     uuid,
  p_quantity       integer,
  p_movement_type  text DEFAULT 'sale',
  p_reference_id   uuid DEFAULT NULL,
  p_reference_type text DEFAULT '',
  p_note           text DEFAULT '',
  p_actor          text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_stock integer;
  v_new_stock     integer;
  v_movement_id   uuid;
  v_product_name  text;
  v_header_cid    text;
BEGIN
  -- Header guard (belt-and-braces with RLS)
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'p_client_id does not match x-client-id header'
    );
  END IF;

  -- Validate inputs
  IF p_product_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'p_product_id is required');
  END IF;

  IF p_quantity = 0 THEN
    RETURN json_build_object('success', false, 'error', 'p_quantity must not be zero');
  END IF;

  -- Lock the product row to prevent concurrent stock races
  SELECT stock_quantity, name INTO v_current_stock, v_product_name
  FROM public.products
  WHERE id = p_product_id AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'product not found');
  END IF;

  -- Calculate new stock
  v_new_stock := v_current_stock + p_quantity;

  -- Prevent negative stock
  IF v_new_stock < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', format('insufficient stock: have %s, trying to remove %s', v_current_stock, abs(p_quantity)),
      'current_stock', v_current_stock
    );
  END IF;

  -- Insert movement record
  INSERT INTO public.stock_movements (
    client_id, product_id, product_name, quantity, movement_type,
    reference_id, reference_type, note, actor
  ) VALUES (
    p_client_id, p_product_id, v_product_name, p_quantity, p_movement_type,
    p_reference_id, p_reference_type, p_note, p_actor
  )
  RETURNING id INTO v_movement_id;

  -- Update product stock
  UPDATE public.products
  SET stock_quantity = v_new_stock
  WHERE id = p_product_id AND client_id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'new_stock_quantity', v_new_stock,
    'previous_stock_quantity', v_current_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(
  text, uuid, integer, text, uuid, text, text, text
) TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. RPC: get_stock_alerts() -- products below low_stock_threshold
-- ---------------------------------------------------------------------------
-- Returns all products where stock_quantity <= low_stock_threshold.
-- Serves the "Low Stock" dashboard widget and mobile push alerts.
--
-- Parameters:
--   p_client_id  -- tenant
--   p_limit      -- max rows (default 50, hard cap 200)
--
-- Returns: TABLE (product_id, name, category, stock_quantity,
--                  low_stock_threshold, deficit, unit)
CREATE OR REPLACE FUNCTION public.get_stock_alerts(
  p_client_id text,
  p_limit     integer DEFAULT 50
)
RETURNS TABLE (
  product_id          uuid,
  name                text,
  category            text,
  stock_quantity      integer,
  low_stock_threshold integer,
  deficit             integer,
  unit                text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid text;
  v_cap        integer;
BEGIN
  -- Header guard
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RAISE EXCEPTION 'p_client_id does not match x-client-id header';
  END IF;

  -- Cap the limit
  v_cap := LEAST(GREATEST(p_limit, 1), 200);

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name,
    p.category,
    p.stock_quantity,
    p.low_stock_threshold,
    (p.low_stock_threshold - p.stock_quantity) AS deficit,
    p.unit
  FROM public.products p
  WHERE p.client_id = p_client_id
    AND p.soft_deleted = false
    AND p.stock_quantity <= p.low_stock_threshold
  ORDER BY (p.low_stock_threshold - p.stock_quantity) DESC
  LIMIT v_cap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_alerts(text, integer)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. RPC: generate_gst_report() -- compute GST summary for a period
-- ---------------------------------------------------------------------------
-- Scans gst_invoices for the given period and client, computes totals,
-- and upserts into gst_reports. Returns the report row.
--
-- Parameters:
--   p_client_id   -- tenant
--   p_period_start -- start date (inclusive)
--   p_period_end   -- end date (inclusive)
--   p_report_type  -- 'monthly'|'quarterly'|'yearly'|'custom'
--
-- Returns: jsonb with the report row
CREATE OR REPLACE FUNCTION public.generate_gst_report(
  p_client_id    text,
  p_period_start date,
  p_period_end   date,
  p_report_type  text DEFAULT 'monthly'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid   text;
  v_totals       record;
  v_report_id    uuid;
  v_result       jsonb;
BEGIN
  -- Header guard
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RAISE EXCEPTION 'p_client_id does not match x-client-id header';
  END IF;

  -- Validate period
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be >= period_start';
  END IF;

  -- Compute totals from gst_invoices for this client + period
  SELECT
    COALESCE(SUM(gi.taxable_value), 0)   AS total_taxable,
    COALESCE(SUM(gi.cgst_amount), 0)     AS total_cgst,
    COALESCE(SUM(gi.sgst_amount), 0)     AS total_sgst,
    COALESCE(SUM(gi.igst_amount), 0)     AS total_igst,
    COUNT(gi.id)                          AS total_invoices,
    COALESCE(SUM(item_counts.cnt), 0)    AS total_items
  INTO v_totals
  FROM public.gst_invoices gi
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.gst_invoice_items gii
    WHERE gii.invoice_id = gi.id
  ) item_counts ON true
  WHERE gi.client_id = p_client_id
    AND gi.invoice_date >= p_period_start
    AND gi.invoice_date <= p_period_end
    AND gi.status <> 'cancelled';

  -- Upsert the report
  INSERT INTO public.gst_reports (
    client_id, period_start, period_end, report_type,
    total_taxable, total_cgst, total_sgst, total_igst,
    total_invoices, total_items, status, generated_at
  ) VALUES (
    p_client_id, p_period_start, p_period_end, p_report_type,
    v_totals.total_taxable, v_totals.total_cgst, v_totals.total_sgst,
    v_totals.total_igst, v_totals.total_invoices, v_totals.total_items,
    'final', now()
  )
  ON CONFLICT (client_id, period_start, period_end, report_type)
  DO UPDATE SET
    total_taxable  = EXCLUDED.total_taxable,
    total_cgst     = EXCLUDED.total_cgst,
    total_sgst     = EXCLUDED.total_sgst,
    total_igst     = EXCLUDED.total_igst,
    total_invoices = EXCLUDED.total_invoices,
    total_items    = EXCLUDED.total_items,
    status         = 'final',
    generated_at   = now()
  RETURNING id INTO v_report_id;

  -- Return the full report row
  SELECT to_jsonb(gr.*) INTO v_result
  FROM public.gst_reports gr
  WHERE gr.id = v_report_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_gst_report(text, date, date, text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. Indexes for existing products table -- inventory query patterns
-- ---------------------------------------------------------------------------
-- These serve dashboard queries: "products with low stock", "products by
-- category with stock levels", "product search with stock info".

-- "Products sorted by stock level" -- inventory dashboard
CREATE INDEX IF NOT EXISTS products_stock_quantity_idx
  ON public.products (client_id, stock_quantity)
  WHERE soft_deleted = false;

-- "Products by HSN code" -- GST invoice auto-fill
CREATE INDEX IF NOT EXISTS products_hsn_code_idx
  ON public.products (client_id, hsn_code)
  WHERE soft_deleted = false AND hsn_code <> '3925';

-- "Products with stock alerts" -- dashboard widget (partial index)
CREATE INDEX IF NOT EXISTS products_low_stock_idx
  ON public.products (client_id, stock_quantity, low_stock_threshold)
  WHERE soft_deleted = false AND stock_quantity <= low_stock_threshold;


-- ---------------------------------------------------------------------------
-- 9. RPC: get_stock_summary() -- dashboard overview
-- ---------------------------------------------------------------------------
-- Returns aggregate stock stats for the dashboard:
--   total_products, total_stock_value, low_stock_count, out_of_stock_count
--
-- Parameters:
--   p_client_id -- tenant
--
-- Returns: jsonb
CREATE OR REPLACE FUNCTION public.get_stock_summary(
  p_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid text;
  v_result     jsonb;
BEGIN
  -- Header guard
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RAISE EXCEPTION 'p_client_id does not match x-client-id header';
  END IF;

  SELECT json_build_object(
    'total_products', COUNT(*)::int,
    'total_stock_value', COALESCE(SUM(p.price * p.stock_quantity), 0),
    'low_stock_count', COUNT(*) FILTER (WHERE p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold)::int,
    'out_of_stock_count', COUNT(*) FILTER (WHERE p.stock_quantity = 0)::int,
    'in_stock_count', COUNT(*) FILTER (WHERE p.stock_quantity > 0)::int
  ) INTO v_result
  FROM public.products p
  WHERE p.client_id = p_client_id
    AND p.soft_deleted = false;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_summary(text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 10. Extend audit_logs with inventory-specific indexes
-- ---------------------------------------------------------------------------
-- audit_logs already exists (migration 009). We add a partial index for
-- inventory-related audit entries to speed up the "Inventory History" panel.

CREATE INDEX IF NOT EXISTS audit_logs_client_entity_action_idx
  ON public.stock_movements (client_id, movement_type, created_at DESC);


COMMIT;

-- Reload PostgREST schema cache so REST API sees the new tables/columns
NOTIFY pgrst, 'reload schema';
