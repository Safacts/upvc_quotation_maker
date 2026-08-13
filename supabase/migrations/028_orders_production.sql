-- ============================================================================
-- Migration 028 -- Orders, Production Tracking, Batches
--                  EvaERP-competitive: order management, shop floor, dispatch
-- ============================================================================
--
-- SCOPE
--   1. orders          -- confirmed orders from quotations
--   2. production_orders -- per-order stage tracking (cutting->assembly->qc->packing->ready)
--   3. batches         -- group production orders for shop floor scheduling
--   4. RPCs            -- create_order_from_quotation(), advance_order_status(),
--                        create_batch(), complete_production_order()
--
-- PREREQUISITES
--   007_customers.sql         (customers table exists)
--   006_secure_quotations.sql (quotations table exists)
--
-- DESIGN DECISIONS
--   - orders.balance is a STORED GENERATED COLUMN: always consistent,
--     no app-layer recalculation needed.
--   - order_number is text, not integer: supports tenant prefixes like
--     KPR-ORD-0001. Sequence is per-tenant via RPC.
--   - production_orders.stage is the UPVC manufacturing pipeline:
--     cutting -> assembly -> qc -> packing -> ready. Each order goes
--     through all stages sequentially.
--   - batches group production_orders for bulk shop floor operations.
--     A batch tracks aggregate completion via completed_orders counter.
--   - All tables carry client_id for multi-tenant isolation.
--   - RLS follows the standard triple: service_role + client_isolation + no public.
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. orders -- confirmed orders from quotations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text NOT NULL DEFAULT 'venkateshwara',
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  quotation_id      uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  order_number      text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','production','dispatched','installed','completed','cancelled')),
  total_amount      numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount       numeric(12,2) NOT NULL DEFAULT 0,
  balance           numeric(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  expected_delivery date,
  actual_delivery   date,
  notes             text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- CHECK: amounts must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'orders_total_amount_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_amount_chk CHECK (total_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'orders_paid_amount_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_paid_amount_chk CHECK (paid_amount >= 0);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS orders_client_status_idx
  ON public.orders (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_client_customer_idx
  ON public.orders (client_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_client_number_idx
  ON public.orders (client_id, order_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_number_unique_idx
  ON public.orders (client_id, order_number)
  WHERE order_number <> '';

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_orders
      BEFORE UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on orders" ON public.orders;
CREATE POLICY "Allow service_role full access on orders"
    ON public.orders
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_orders" ON public.orders;
CREATE POLICY "client_isolation_orders"
    ON public.orders
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 2. production_orders -- per-order stage tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage         text NOT NULL DEFAULT 'cutting'
                CHECK (stage IN ('cutting','assembly','qc','packing','ready')),
  assigned_to   text NOT NULL DEFAULT '',
  batch_id      uuid,
  priority      integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','on_hold')),
  started_at    timestamptz,
  completed_at  timestamptz,
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS production_orders_client_stage_idx
  ON public.production_orders (client_id, stage, status);

CREATE INDEX IF NOT EXISTS production_orders_client_order_idx
  ON public.production_orders (client_id, order_id);

CREATE INDEX IF NOT EXISTS production_orders_client_batch_idx
  ON public.production_orders (client_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS production_orders_client_status_idx
  ON public.production_orders (client_id, status, created_at DESC);

-- RLS
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on production_orders" ON public.production_orders;
CREATE POLICY "Allow service_role full access on production_orders"
    ON public.production_orders
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_production_orders" ON public.production_orders;
CREATE POLICY "client_isolation_production_orders"
    ON public.production_orders
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 3. batches -- group production orders for shop floor scheduling
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text NOT NULL DEFAULT 'venkateshwara',
  batch_number      text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning','in_progress','completed')),
  total_orders      integer NOT NULL DEFAULT 0,
  completed_orders  integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS batches_client_status_idx
  ON public.batches (client_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS batches_client_number_unique_idx
  ON public.batches (client_id, batch_number)
  WHERE batch_number <> '';

-- RLS
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on batches" ON public.batches;
CREATE POLICY "Allow service_role full access on batches"
    ON public.batches
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_batches" ON public.batches;
CREATE POLICY "client_isolation_batches"
    ON public.batches
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 4. RPC: create_order_from_quotation() -- atomic order creation
-- ---------------------------------------------------------------------------
-- Copies customer snapshot, line items, and totals from a quotation into a
-- new order. Returns the created order row.
--
-- Parameters:
--   p_client_id     -- tenant
--   p_quotation_id  -- source quotation
--   p_order_number  -- unique order number
--   p_expected_delivery -- target delivery date (nullable)
--   p_notes         -- order notes
--
-- Returns: jsonb
CREATE OR REPLACE FUNCTION public.create_order_from_quotation(
  p_client_id          text,
  p_quotation_id       uuid,
  p_order_number       text DEFAULT '',
  p_expected_delivery  date DEFAULT NULL,
  p_notes              text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid   text;
  v_quotation    record;
  v_order_id     uuid;
  v_order        record;
BEGIN
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RETURN json_build_object('success', false, 'error', 'p_client_id does not match x-client-id header');
  END IF;

  IF p_quotation_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'p_quotation_id is required');
  END IF;

  SELECT * INTO v_quotation
  FROM public.quotations
  WHERE id = p_quotation_id AND client_id = p_client_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'quotation not found');
  END IF;

  INSERT INTO public.orders (
    client_id, customer_id, quotation_id, order_number,
    status, total_amount, expected_delivery, notes
  ) VALUES (
    p_client_id,
    v_quotation.customer_id,
    p_quotation_id,
    p_order_number,
    'confirmed',
    COALESCE(
      (SELECT grand_total FROM public.quotation_money
       WHERE id = p_quotation_id AND client_id = p_client_id),
      0
    ),
    p_expected_delivery,
    p_notes
  )
  RETURNING id INTO v_order_id;

  SELECT to_jsonb(o.*) INTO v_order
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN json_build_object('success', true, 'order', v_order);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_from_quotation(text, uuid, text, date, text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. RPC: advance_order_status() -- move order through pipeline
-- ---------------------------------------------------------------------------
-- Validates the status transition is legal, updates the order, and
-- auto-creates a production_order row when entering 'production' stage.
--
-- Parameters:
--   p_client_id  -- tenant
--   p_order_id   -- the order
--   p_new_status -- target status
--
-- Returns: jsonb
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_client_id  text,
  p_order_id   uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid text;
  v_order      record;
  v_valid      boolean := false;
BEGIN
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RETURN json_build_object('success', false, 'error', 'p_client_id does not match x-client-id header');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND client_id = p_client_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'order not found');
  END IF;

  -- Validate transition
  v_valid := CASE
    WHEN v_order.status = 'confirmed'   AND p_new_status = 'production'   THEN true
    WHEN v_order.status = 'production'  AND p_new_status = 'dispatched'   THEN true
    WHEN v_order.status = 'dispatched'  AND p_new_status = 'installed'    THEN true
    WHEN v_order.status = 'installed'   AND p_new_status = 'completed'    THEN true
    WHEN v_order.status IN ('confirmed','production','dispatched','installed')
         AND p_new_status = 'cancelled' THEN true
    ELSE false
  END CASE;

  IF NOT v_valid THEN
    RETURN json_build_object(
      'success', false,
      'error', format('cannot transition from %s to %s', v_order.status, p_new_status)
    );
  END IF;

  UPDATE public.orders
  SET status = p_new_status,
      actual_delivery = CASE WHEN p_new_status IN ('dispatched','completed') THEN COALESCE(actual_delivery, CURRENT_DATE) ELSE actual_delivery END
  WHERE id = p_order_id AND client_id = p_client_id;

  -- Auto-create production_order when entering production
  IF p_new_status = 'production' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.production_orders
      WHERE order_id = p_order_id AND client_id = p_client_id
    ) THEN
      INSERT INTO public.production_orders (client_id, order_id, stage, status)
      VALUES (p_client_id, p_order_id, 'cutting', 'pending');
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'order_id', p_order_id, 'new_status', p_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_order_status(text, uuid, text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. RPC: create_batch() -- create batch and auto-assign pending production orders
-- ---------------------------------------------------------------------------
-- Groups unbatched production_orders at a given stage into a new batch.
--
-- Parameters:
--   p_client_id   -- tenant
--   p_batch_number -- unique batch number
--   p_stage       -- which stage to batch (default 'cutting')
--   p_limit       -- max orders to assign (default 50)
--
-- Returns: jsonb
CREATE OR REPLACE FUNCTION public.create_batch(
  p_client_id     text,
  p_batch_number  text DEFAULT '',
  p_stage         text DEFAULT 'cutting',
  p_limit         integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid text;
  v_batch_id   uuid;
  v_assigned   integer;
BEGIN
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RETURN json_build_object('success', false, 'error', 'p_client_id does not match x-client-id header');
  END IF;

  INSERT INTO public.batches (client_id, batch_number, status)
  VALUES (p_client_id, p_batch_number, 'planning')
  RETURNING id INTO v_batch_id;

  WITH assign AS (
    UPDATE public.production_orders po
    SET batch_id = v_batch_id
    WHERE po.client_id = p_client_id
      AND po.stage = p_stage
      AND po.status = 'pending'
      AND po.batch_id IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_assigned FROM assign;

  UPDATE public.batches
  SET total_orders = v_assigned,
      status = CASE WHEN v_assigned > 0 THEN 'in_progress' ELSE 'planning' END
  WHERE id = v_batch_id AND client_id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'assigned_orders', v_assigned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_batch(text, text, text, integer)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. RPC: complete_production_order() -- mark stage done, advance or complete
-- ---------------------------------------------------------------------------
-- Marks a production_order as completed and advances it to the next stage.
-- When the last stage ('ready') is completed, the parent order status is
-- updated to 'dispatched'.
--
-- Parameters:
--   p_client_id  -- tenant
--   p_prod_id    -- production_order id
--
-- Returns: jsonb
CREATE OR REPLACE FUNCTION public.complete_production_order(
  p_client_id text,
  p_prod_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid text;
  v_prod       record;
  v_next_stage text;
  v_order      record;
BEGIN
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RETURN json_build_object('success', false, 'error', 'p_client_id does not match x-client-id header');
  END IF;

  SELECT * INTO v_prod
  FROM public.production_orders
  WHERE id = p_prod_id AND client_id = p_client_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'production_order not found');
  END IF;

  IF v_prod.status = 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'already completed');
  END IF;

  -- Determine next stage
  v_next_stage := CASE v_prod.stage
    WHEN 'cutting'  THEN 'assembly'
    WHEN 'assembly' THEN 'qc'
    WHEN 'qc'       THEN 'packing'
    WHEN 'packing'  THEN 'ready'
    ELSE NULL
  END CASE;

  UPDATE public.production_orders
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_prod_id AND client_id = p_client_id;

  IF v_next_stage IS NOT NULL THEN
    UPDATE public.production_orders
    SET stage = v_next_stage,
        status = 'pending',
        started_at = NULL,
        completed_at = NULL
    WHERE id = p_prod_id AND client_id = p_client_id;
  ELSE
    -- Last stage done: advance the parent order to 'dispatched'
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_prod.order_id AND client_id = p_client_id;

    IF FOUND AND v_order.status = 'production' THEN
      UPDATE public.orders
      SET status = 'dispatched',
          actual_delivery = COALESCE(actual_delivery, CURRENT_DATE)
      WHERE id = v_prod.order_id AND client_id = p_client_id;
    END IF;

    -- Update batch completion count
    IF v_prod.batch_id IS NOT NULL THEN
      UPDATE public.batches
      SET completed_orders = completed_orders + 1,
          status = CASE
            WHEN completed_orders + 1 >= total_orders THEN 'completed'
            ELSE status
          END,
          completed_at = CASE
            WHEN completed_orders + 1 >= total_orders THEN now()
            ELSE completed_at
          END
      WHERE id = v_prod.batch_id AND client_id = p_client_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'production_order_id', p_prod_id,
    'completed_stage', v_prod.stage,
    'next_stage', v_next_stage
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_production_order(text, uuid)
  TO anon, authenticated, service_role;


COMMIT;

NOTIFY pgrst, 'reload schema';
