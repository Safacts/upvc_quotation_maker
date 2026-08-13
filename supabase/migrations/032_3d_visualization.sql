-- ============================================================================
-- Migration 032 -- 3D Visualization (EvaERP Phase 6)
-- ============================================================================
--
-- SCOPE
--   1. window_designs -- stored 3D window designs with frames/panels geometry
--   2. renders         -- rendered images (thumbnail/full) of a design
--
-- PREREQUISITES
--   006_secure_quotations.sql  (quotations table for order FK)
--   028_orders_production.sql  (orders table for order_id FK)
--
-- DESIGN DECISIONS
--   - client_id is TEXT (not uuid) to match clients.id TEXT PK and every
--     other table. The x-client-id header carries a TEXT slug; using uuid
--     here would break the tenant-isolation RLS contract.
--   - orders.id / window_designs.id are uuid -- FKs reference them as uuid.
--   - window_designs.order_id is nullable (design may exist before an order).
--   - renders.design_id is NOT NULL (a render always belongs to a design).
--   - renders cascades on delete: removing a design wipes its renders.
--   - All columns use NOT NULL DEFAULT where the app might omit them, so
--     inserts stay forward-compatible when new fields are added.
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. window_designs -- interactive 3D window models
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.window_designs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  order_id      uuid,
  name          text NOT NULL DEFAULT '',
  profile_type  text NOT NULL DEFAULT 'uPVC',
  dimensions    jsonb NOT NULL DEFAULT '{"width_mm":0,"height_mm":0,"configuration":"fixed"}',
  design        jsonb NOT NULL DEFAULT '{"frames":[],"panels":[]}',
  thumbnail_url text,
  model_url     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'window_designs_profile_type_chk'
      AND conrelid = 'public.window_designs'::regclass
  ) THEN
    ALTER TABLE public.window_designs
      ADD CONSTRAINT window_designs_profile_type_chk
      CHECK (profile_type IN ('uPVC', 'aluminum'));
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. FK: window_designs.order_id -> orders(id)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'window_designs_order_id_fkey'
      AND conrelid = 'public.window_designs'::regclass
  ) THEN
    ALTER TABLE public.window_designs
      ADD CONSTRAINT window_designs_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Indexes for window_designs
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS window_designs_client_idx
  ON public.window_designs (client_id);

CREATE INDEX IF NOT EXISTS window_designs_order_idx
  ON public.window_designs (order_id);

CREATE INDEX IF NOT EXISTS window_designs_client_created_idx
  ON public.window_designs (client_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 4. window_designs RLS -- standard triple pattern
-- ---------------------------------------------------------------------------
ALTER TABLE public.window_designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on window_designs" ON public.window_designs;
CREATE POLICY "Allow service_role full access on window_designs"
    ON public.window_designs
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_window_designs" ON public.window_designs;
CREATE POLICY "client_isolation_window_designs"
    ON public.window_designs
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 5. renders -- rendered images of a design (thumbnail / full)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.renders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        text NOT NULL DEFAULT 'venkateshwara',
  design_id        uuid NOT NULL,
  render_type      text NOT NULL CHECK (render_type IN ('thumbnail', 'full')),
  url              text NOT NULL,
  width            integer,
  height           integer,
  render_time_ms   integer,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'renders_design_id_fkey'
      AND conrelid = 'public.renders'::regclass
  ) THEN
    ALTER TABLE public.renders
      ADD CONSTRAINT renders_design_id_fkey
      FOREIGN KEY (design_id) REFERENCES public.window_designs(id)
      ON DELETE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 6. Indexes for renders
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS renders_client_idx
  ON public.renders (client_id);

CREATE INDEX IF NOT EXISTS renders_design_idx
  ON public.renders (design_id);

CREATE INDEX IF NOT EXISTS renders_design_type_idx
  ON public.renders (design_id, render_type);

CREATE INDEX IF NOT EXISTS renders_status_idx
  ON public.renders (status)
  WHERE status IN ('pending', 'rendering');

CREATE INDEX IF NOT EXISTS renders_client_created_idx
  ON public.renders (client_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 7. renders RLS -- standard triple pattern
-- ---------------------------------------------------------------------------
ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on renders" ON public.renders;
CREATE POLICY "Allow service_role full access on renders"
    ON public.renders
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_renders" ON public.renders;
CREATE POLICY "client_isolation_renders"
    ON public.renders
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 8. updated_at trigger on window_designs (renders has no updated_at)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_window_designs ON public.window_designs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_window_designs
      BEFORE UPDATE ON public.window_designs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


COMMIT;

NOTIFY pgrst, 'reload schema';
