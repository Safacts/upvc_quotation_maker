-- ============================================================================
-- Migration 022 -- UPVC Product Configuration
-- ============================================================================
--
-- SCOPE
--   UPVC-specific product configuration table that stores profile types,
--   glass specifications, hardware, colors, and mesh options for each product.
--   This enables the Flutter app to offer UPVC-specific configuration when
--   creating quotations.
--
-- PREREQUISITES
--   008_products.sql         (products table exists)
--   schema_clients.sql       (clients table exists with TEXT primary key)
--
-- DESIGN DECISIONS
--   - client_id is TEXT (not UUID) to match clients.id which is TEXT PK.
--   - ON DELETE CASCADE for both FKs: if a product or client is deleted,
--     their UPVC config is no longer relevant.
--   - All config columns use CHECK constraints or controlled vocabularies
--     to prevent typos in the database.
--   - mesh_type is NULLABLE because not all UPVC products use mesh.
--   - Glass thickness is numeric(4,1) to support values like 4.0, 5.0, 6.0,
--     8.0, 10.0, 12.0, etc.
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. upvc_product_config -- UPVC-specific product configuration
-- ---------------------------------------------------------------------------
-- Each product can have multiple UPVC configurations (e.g., same profile
-- available in sliding and casement, with different glass options).
-- The (client_id, product_id, profile_type, glass_type) combination
-- should be unique per client to prevent duplicate configs.

CREATE TABLE IF NOT EXISTS public.upvc_product_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL,                        -- REFERENCES clients(id) - TEXT PK
  product_id      uuid NOT NULL,                        -- REFERENCES products(id)
  profile_type    text NOT NULL,                        -- 'sliding'|'casement'|'fixed'|'tilt-turn'
  glass_type      text NOT NULL,                        -- 'single'|'double'|'toughened'|'laminated'
  glass_thickness numeric(4,1) NOT NULL DEFAULT 5.0,   -- mm (4.0 to 99.9)
  hardware_type   text NOT NULL DEFAULT 'standard',    -- 'standard'|'premium'|'heavy-duty'
  color           text NOT NULL DEFAULT 'white',        -- 'white'|'brown'|'grey'|'black'|'woodgrain'
  mesh_type       text,                                 -- NULL|'none'|'plain'|'pleated'|'magnetic'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- CHECK constraints for controlled vocabularies
DO $$
BEGIN
  -- profile_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_profile_type_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_profile_type_chk
      CHECK (profile_type IN ('sliding', 'casement', 'fixed', 'tilt-turn'));
  END IF;

  -- glass_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_glass_type_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_glass_type_chk
      CHECK (glass_type IN ('single', 'double', 'toughened', 'laminated'));
  END IF;

  -- hardware_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_hardware_type_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_hardware_type_chk
      CHECK (hardware_type IN ('standard', 'premium', 'heavy-duty'));
  END IF;

  -- color
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_color_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_color_chk
      CHECK (color IN ('white', 'brown', 'grey', 'black', 'woodgrain'));
  END IF;

  -- mesh_type (NULL or one of the allowed values)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_mesh_type_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_mesh_type_chk
      CHECK (mesh_type IS NULL OR mesh_type IN ('none', 'plain', 'pleated', 'magnetic'));
  END IF;

  -- glass_thickness: must be positive and reasonable (1.0 to 99.9 mm)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_glass_thickness_chk'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_glass_thickness_chk
      CHECK (glass_thickness >= 1.0 AND glass_thickness <= 99.9);
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Foreign keys (with IF NOT EXISTS guard)
-- ---------------------------------------------------------------------------
-- FK to clients: ON DELETE CASCADE - if client is deleted, config is irrelevant
-- FK to products: ON DELETE CASCADE - if product is deleted, config is irrelevant

DO $$
BEGIN
  -- FK to clients
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_client_id_fkey'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id)
      ON DELETE CASCADE;
  END IF;

  -- FK to products
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'upvc_product_config_product_id_fkey'
      AND conrelid = 'public.upvc_product_config'::regclass
  ) THEN
    ALTER TABLE public.upvc_product_config
      ADD CONSTRAINT upvc_product_config_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id)
      ON DELETE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Unique constraint: one config per (client, product, profile, glass)
-- ---------------------------------------------------------------------------
-- Prevents duplicate UPVC configurations for the same product.
-- Allows the same profile+glass combination with different hardware/color
-- (those are variations, not duplicates).

CREATE UNIQUE INDEX IF NOT EXISTS upvc_product_config_unique_idx
  ON public.upvc_product_config (client_id, product_id, profile_type, glass_type);


-- ---------------------------------------------------------------------------
-- 4. Indexes for common query patterns
-- ---------------------------------------------------------------------------
-- "All UPVC configs for this client" -- client's product configurator
CREATE INDEX IF NOT EXISTS upvc_config_client_idx
  ON public.upvc_product_config (client_id);

-- "All UPVC configs for this product" -- product detail page
CREATE INDEX IF NOT EXISTS upvc_config_product_idx
  ON public.upvc_product_config (product_id);

-- "Configs by profile type for this client" -- filter by profile
CREATE INDEX IF NOT EXISTS upvc_config_client_profile_idx
  ON public.upvc_product_config (client_id, profile_type);


-- ---------------------------------------------------------------------------
-- 5. RLS -- standard triple pattern
-- ---------------------------------------------------------------------------
ALTER TABLE public.upvc_product_config ENABLE ROW LEVEL SECURITY;

-- service_role: full access (for Next.js API)
DROP POLICY IF EXISTS "Allow service_role full access on upvc_product_config" ON public.upvc_product_config;
CREATE POLICY "Allow service_role full access on upvc_product_config"
    ON public.upvc_product_config
    USING (auth.role() = 'service_role');

-- client_isolation: anon/authenticated can only see their own client's configs
DROP POLICY IF EXISTS "client_isolation_upvc_product_config" ON public.upvc_product_config;
CREATE POLICY "client_isolation_upvc_product_config"
    ON public.upvc_product_config
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 6. updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_upvc_product_config ON public.upvc_product_config;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_upvc_product_config
      BEFORE UPDATE ON public.upvc_product_config
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 7. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.upvc_product_config IS
  'UPVC-specific product configuration: profile types, glass specs, hardware, '
  'colors, and mesh options. One row per unique (client, product, profile_type, '
  'glass_type) combination. Used by Flutter app for quotation configuration.';

COMMENT ON COLUMN public.upvc_product_config.profile_type IS
  'Window/door profile type: sliding, casement, fixed, or tilt-turn.';

COMMENT ON COLUMN public.upvc_product_config.glass_type IS
  'Glass specification: single pane, double glazed, toughened, or laminated.';

COMMENT ON COLUMN public.upvc_product_config.glass_thickness IS
  'Glass thickness in millimeters. Range: 1.0 to 99.9 mm. Common values: '
  '4.0, 5.0, 6.0, 8.0, 10.0, 12.0.';

COMMENT ON COLUMN public.upvc_product_config.hardware_type IS
  'Hardware quality level: standard, premium, or heavy-duty. Affects pricing.';

COMMENT ON COLUMN public.upvc_product_config.color IS
  'Profile color: white, brown, grey, black, or woodgrain finish.';

COMMENT ON COLUMN public.upvc_product_config.mesh_type IS
  'Insect mesh type (nullable): plain, pleated, magnetic, or none.';


COMMIT;

NOTIFY pgrst, 'reload schema';
