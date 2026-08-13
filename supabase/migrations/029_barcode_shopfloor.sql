-- ============================================================================
-- Migration 029 -- Barcode scanning & shop floor tracking
--                  Extends 028_orders_production.sql
-- ============================================================================
--
-- TABLES
--   1. barcodes           -- one barcode per production order, scanned at stages
--   2. shopfloor_updates  -- real-time feed of stage changes & worker activity
--
-- PREREQUISITES
--   028_orders_production.sql (orders + production_orders exist)
--
-- IDEMPOTENT -- safe to re-run
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. barcodes -- scannable labels linked to production orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barcodes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             text NOT NULL DEFAULT 'venkateshwara',
  order_id              uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  production_order_id   uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  barcode_value         text NOT NULL,
  stage                 text NOT NULL DEFAULT 'cutting',
  scanned_at            timestamptz,
  scanned_by            text NOT NULL DEFAULT '',
  location              text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Unique barcode value globally (barcodes are human-scannable, must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS barcodes_value_unique_idx
  ON public.barcodes (barcode_value);

-- Query patterns: list by client, lookup by value, filter by stage
CREATE INDEX IF NOT EXISTS barcodes_client_idx
  ON public.barcodes (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS barcodes_prod_order_idx
  ON public.barcodes (client_id, production_order_id)
  WHERE production_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS barcodes_stage_idx
  ON public.barcodes (client_id, stage);

-- RLS
ALTER TABLE public.barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on barcodes" ON public.barcodes;
CREATE POLICY "Allow service_role full access on barcodes"
    ON public.barcodes
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_barcodes" ON public.barcodes;
CREATE POLICY "client_isolation_barcodes"
    ON public.barcodes
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 2. shopfloor_updates -- real-time feed of stage changes & worker activity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shopfloor_updates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             text NOT NULL DEFAULT 'venkateshwara',
  production_order_id   uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  stage                 text NOT NULL,
  status                text NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','completed','on_hold','issue')),
  worker_id             text NOT NULL DEFAULT '',
  notes                 text NOT NULL DEFAULT '',
  timestamp             timestamptz NOT NULL DEFAULT now()
);

-- Query patterns: feed by client+time, filter by stage, lookup by production order
CREATE INDEX IF NOT EXISTS shopfloor_client_time_idx
  ON public.shopfloor_updates (client_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS shopfloor_prod_order_idx
  ON public.shopfloor_updates (client_id, production_order_id);

CREATE INDEX IF NOT EXISTS shopfloor_stage_idx
  ON public.shopfloor_updates (client_id, stage, timestamp DESC);

-- RLS
ALTER TABLE public.shopfloor_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on shopfloor_updates" ON public.shopfloor_updates;
CREATE POLICY "Allow service_role full access on shopfloor_updates"
    ON public.shopfloor_updates
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_shopfloor_updates" ON public.shopfloor_updates;
CREATE POLICY "client_isolation_shopfloor_updates"
    ON public.shopfloor_updates
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


COMMIT;

NOTIFY pgrst, 'reload schema';
