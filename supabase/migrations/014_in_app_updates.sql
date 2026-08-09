-- ============================================================================
-- Migration 014 -- In-app update mechanism: offline sync, feature flags,
--                  content manifest, dynamic white-labeling
-- ============================================================================
--
-- SCOPE
--   Backend schema for the in-app update mechanism that allows dynamic content
--   updates without rebuilding the APK. Supports:
--     1. Content manifest — version tracking for all syncable content
--     2. Feature flags per tier — Low/Base/Next/Next+/Final
--     3. Dynamic white-labeling — server-pushed branding config
--     4. Sync log — tracks sync operations for debugging
--
-- WHAT'S NEW
--   1. content_manifest     — version tracking for products, pricing, terms, etc.
--   2. feature_flags        — per-tier feature toggles
--   3. client_config_dynamic — server-pushed branding (logo, colors, etc.)
--   4. sync_log             — audit trail of sync operations
--
-- PREREQUISITES
--   008_products.sql       (products table)
--   009_masters.sql        (audit_logs)
--   010_console_rpcs.sql   (existing RPCs)
--   012_mobile_features.sql (payments, app_notifications)
--
-- RLS CONTRACT (identical to all prior migrations)
--   Standard policy triple for each new table:
--     "Allow public all on X"              -- anon-key app
--     "Allow service_role full access on X" -- Next.js API routes
--     "client_isolation_X"                 -- x-client-id header match
--
-- ASCII-ONLY BY DESIGN (matching 012 convention)
-- IDEMPOTENT -- safe to re-run
--
-- Apply via the pooler, then: NOTIFY pgrst, 'reload schema';
-- TAKE A BACKUP FIRST: scripts\run_backup.bat
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. content_manifest -- version tracking for all syncable content
-- ---------------------------------------------------------------------------
-- Tracks what content exists on the server and its version. The Flutter app
-- compares this against its local cache and only downloads what has changed.
--
-- content_type values:
--   'products'          — product catalog (rate card)
--   'pricing_templates' — pricing templates/presets
--   'terms'             — terms and conditions
--   'bank_details'      — bank account info
--   'supplier_companies' — supplier company names
--
-- version is a monotonic integer that increments on every change.
-- last_modified is the timestamp of the last change (for delta sync).
-- checksum is an MD5 hash of the content for integrity verification.
CREATE TABLE IF NOT EXISTS public.content_manifest (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  content_type  text NOT NULL,
  version       int NOT NULL DEFAULT 1,
  last_modified timestamptz NOT NULL DEFAULT now(),
  checksum      text NOT NULL DEFAULT '',
  item_count    int NOT NULL DEFAULT 0,
  
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one manifest row per client per content type
CREATE UNIQUE INDEX IF NOT EXISTS content_manifest_client_type_idx
  ON public.content_manifest (client_id, content_type);

-- Index for fetching all manifest rows for a client
CREATE INDEX IF NOT EXISTS content_manifest_client_idx
  ON public.content_manifest (client_id);

ALTER TABLE public.content_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on content_manifest" ON public.content_manifest;
CREATE POLICY "Allow public all on content_manifest"
    ON public.content_manifest
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on content_manifest" ON public.content_manifest;
CREATE POLICY "Allow service_role full access on content_manifest"
    ON public.content_manifest
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_content_manifest" ON public.content_manifest;
CREATE POLICY "client_isolation_content_manifest"
    ON public.content_manifest
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.content_manifest IS
  'Version tracking for all syncable content. The Flutter app compares this against '
  'its local cache and only downloads what has changed. content_type values: products, '
  'pricing_templates, terms, bank_details, supplier_companies.';


-- ---------------------------------------------------------------------------
-- 2. feature_flags -- per-tier feature toggles
-- ---------------------------------------------------------------------------
-- Controls which features are available based on the client's subscription tier.
-- The Flutter app fetches these on startup and evaluates them client-side.
--
-- tier values: 'low' | 'base' | 'next' | 'next_plus' | 'final'
-- feature_key: unique identifier for the feature
-- enabled: whether the feature is enabled for this tier
-- description: human-readable description of the feature
--
-- Default flags are inserted below for each tier.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text NOT NULL DEFAULT 'venkateshwara',
  tier        text NOT NULL DEFAULT 'base',
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one flag per client per tier per feature
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_client_tier_feature_idx
  ON public.feature_flags (client_id, tier, feature_key);

-- Index for fetching all flags for a client/tier
CREATE INDEX IF NOT EXISTS feature_flags_client_tier_idx
  ON public.feature_flags (client_id, tier);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on feature_flags" ON public.feature_flags;
CREATE POLICY "Allow public all on feature_flags"
    ON public.feature_flags
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on feature_flags" ON public.feature_flags;
CREATE POLICY "Allow service_role full access on feature_flags"
    ON public.feature_flags
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_feature_flags" ON public.feature_flags;
CREATE POLICY "client_isolation_feature_flags"
    ON public.feature_flags
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.feature_flags IS
  'Per-tier feature toggles. The Flutter app fetches these on startup and evaluates '
  'them client-side. tier values: low, base, next, next_plus, final.';

-- Register with Supabase Realtime for real-time updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 3. client_config_dynamic -- server-pushed branding config
-- ---------------------------------------------------------------------------
-- Stores dynamic white-labeling configuration that can be pushed from the server
-- without rebuilding the APK. This supplements the static client_config in the
-- Flutter app with runtime-updatable values.
--
-- config_key: unique identifier for the config value
-- config_value: the value (stored as JSONB for flexibility)
-- value_type: 'string' | 'number' | 'boolean' | 'color' | 'url'
--
-- Examples:
--   logo_url -> {"value": "https://...", "type": "url"}
--   primary_color -> {"value": 6513505, "type": "color"}
--   company_name -> {"value": "My Company", "type": "string"}
CREATE TABLE IF NOT EXISTS public.client_config_dynamic (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   text NOT NULL DEFAULT 'venkateshwara',
  config_key  text NOT NULL,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  value_type  text NOT NULL DEFAULT 'string',
  
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one config value per client per key
CREATE UNIQUE INDEX IF NOT EXISTS client_config_dynamic_client_key_idx
  ON public.client_config_dynamic (client_id, config_key);

-- Index for fetching all config for a client
CREATE INDEX IF NOT EXISTS client_config_dynamic_client_idx
  ON public.client_config_dynamic (client_id);

ALTER TABLE public.client_config_dynamic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on client_config_dynamic" ON public.client_config_dynamic;
CREATE POLICY "Allow public all on client_config_dynamic"
    ON public.client_config_dynamic
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on client_config_dynamic" ON public.client_config_dynamic;
CREATE POLICY "Allow service_role full access on client_config_dynamic"
    ON public.client_config_dynamic
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_client_config_dynamic" ON public.client_config_dynamic;
CREATE POLICY "client_isolation_client_config_dynamic"
    ON public.client_config_dynamic
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.client_config_dynamic IS
  'Server-pushed branding configuration for dynamic white-labeling. Stored as JSONB '
  'for flexibility. The Flutter app fetches these on startup and applies them at runtime.';

-- Register with Supabase Realtime for real-time updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_config_dynamic;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 4. sync_log -- audit trail of sync operations
-- ---------------------------------------------------------------------------
-- Tracks sync operations for debugging and monitoring. The Flutter app writes
-- a log entry after each sync attempt.
--
-- sync_type: 'push' | 'pull' | 'bidirectional'
-- status: 'success' | 'partial' | 'failed'
-- items_synced: number of items synced
-- error_message: error details if sync failed
CREATE TABLE IF NOT EXISTS public.sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  device_id     text NOT NULL DEFAULT '',
  sync_type     text NOT NULL DEFAULT 'pull',
  status        text NOT NULL DEFAULT 'success',
  items_synced  int NOT NULL DEFAULT 0,
  items_failed  int NOT NULL DEFAULT 0,
  error_message text NOT NULL DEFAULT '',
  sync_duration_ms int NOT NULL DEFAULT 0,
  
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fetching sync history for a client
CREATE INDEX IF NOT EXISTS sync_log_client_created_idx
  ON public.sync_log (client_id, created_at DESC);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on sync_log" ON public.sync_log;
CREATE POLICY "Allow public all on sync_log"
    ON public.sync_log
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on sync_log" ON public.sync_log;
CREATE POLICY "Allow service_role full access on sync_log"
    ON public.sync_log
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_sync_log" ON public.sync_log;
CREATE POLICY "client_isolation_sync_log"
    ON public.sync_log
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.sync_log IS
  'Audit trail of sync operations. Written by the Flutter app after each sync attempt '
  'for debugging and monitoring purposes.';


-- ---------------------------------------------------------------------------
-- 5. Default feature flags for each tier
-- ---------------------------------------------------------------------------
-- Insert default feature flags for the default client.
-- These can be customized per client via the console.
--
-- Feature keys:
--   offline_mode          — offline-first mode
--   product_catalog       — product catalog dropdown
--   push_notifications    — push notifications
--   customer_history      — customer history screen
--   site_photos           — camera site photos
--   upi_qr                — UPI QR on invoice
--   custom_domain         — custom domain support
--   desktop_console       — branded desktop console
--   analytics             — analytics dashboard
--   multi_user            — multi-user support
--   api_access            — API access
--   excel_export          — Excel export
--   whatsapp_share        — WhatsApp sharing
--   email_portal          — email portal
--   gst_invoices          — GST invoices

-- Low tier (₹10k) — minimal features
INSERT INTO public.feature_flags (client_id, tier, feature_key, enabled, description)
VALUES
  ('venkateshwara', 'low', 'offline_mode', true, 'Offline-first mode'),
  ('venkateshwara', 'low', 'product_catalog', true, 'Product catalog dropdown'),
  ('venkateshwara', 'low', 'excel_export', true, 'Excel export'),
  ('venkateshwara', 'low', 'whatsapp_share', true, 'WhatsApp sharing'),
  ('venkateshwara', 'low', 'email_portal', false, 'Email portal'),
  ('venkateshwara', 'low', 'push_notifications', false, 'Push notifications'),
  ('venkateshwara', 'low', 'customer_history', false, 'Customer history screen'),
  ('venkateshwara', 'low', 'site_photos', false, 'Camera site photos'),
  ('venkateshwara', 'low', 'upi_qr', false, 'UPI QR on invoice'),
  ('venkateshwara', 'low', 'gst_invoices', false, 'GST invoices'),
  ('venkateshwara', 'low', 'custom_domain', false, 'Custom domain support'),
  ('venkateshwara', 'low', 'desktop_console', false, 'Branded desktop console'),
  ('venkateshwara', 'low', 'analytics', false, 'Analytics dashboard'),
  ('venkateshwara', 'low', 'multi_user', false, 'Multi-user support'),
  ('venkateshwara', 'low', 'api_access', false, 'API access')
ON CONFLICT (client_id, tier, feature_key) DO NOTHING;

-- Base tier (₹20k) — basic features
INSERT INTO public.feature_flags (client_id, tier, feature_key, enabled, description)
VALUES
  ('venkateshwara', 'base', 'offline_mode', true, 'Offline-first mode'),
  ('venkateshwara', 'base', 'product_catalog', true, 'Product catalog dropdown'),
  ('venkateshwara', 'base', 'excel_export', true, 'Excel export'),
  ('venkateshwara', 'base', 'whatsapp_share', true, 'WhatsApp sharing'),
  ('venkateshwara', 'base', 'email_portal', true, 'Email portal'),
  ('venkateshwara', 'base', 'push_notifications', true, 'Push notifications'),
  ('venkateshwara', 'base', 'customer_history', true, 'Customer history screen'),
  ('venkateshwara', 'base', 'site_photos', false, 'Camera site photos'),
  ('venkateshwara', 'base', 'upi_qr', false, 'UPI QR on invoice'),
  ('venkateshwara', 'base', 'gst_invoices', false, 'GST invoices'),
  ('venkateshwara', 'base', 'custom_domain', false, 'Custom domain support'),
  ('venkateshwara', 'base', 'desktop_console', false, 'Branded desktop console'),
  ('venkateshwara', 'base', 'analytics', false, 'Analytics dashboard'),
  ('venkateshwara', 'base', 'multi_user', false, 'Multi-user support'),
  ('venkateshwara', 'base', 'api_access', false, 'API access')
ON CONFLICT (client_id, tier, feature_key) DO NOTHING;

-- Next tier (₹30k) — standard features
INSERT INTO public.feature_flags (client_id, tier, feature_key, enabled, description)
VALUES
  ('venkateshwara', 'next', 'offline_mode', true, 'Offline-first mode'),
  ('venkateshwara', 'next', 'product_catalog', true, 'Product catalog dropdown'),
  ('venkateshwara', 'next', 'excel_export', true, 'Excel export'),
  ('venkateshwara', 'next', 'whatsapp_share', true, 'WhatsApp sharing'),
  ('venkateshwara', 'next', 'email_portal', true, 'Email portal'),
  ('venkateshwara', 'next', 'push_notifications', true, 'Push notifications'),
  ('venkateshwara', 'next', 'customer_history', true, 'Customer history screen'),
  ('venkateshwara', 'next', 'site_photos', true, 'Camera site photos'),
  ('venkateshwara', 'next', 'upi_qr', true, 'UPI QR on invoice'),
  ('venkateshwara', 'next', 'gst_invoices', true, 'GST invoices'),
  ('venkateshwara', 'next', 'custom_domain', false, 'Custom domain support'),
  ('venkateshwara', 'next', 'desktop_console', false, 'Branded desktop console'),
  ('venkateshwara', 'next', 'analytics', false, 'Analytics dashboard'),
  ('venkateshwara', 'next', 'multi_user', false, 'Multi-user support'),
  ('venkateshwara', 'next', 'api_access', false, 'API access')
ON CONFLICT (client_id, tier, feature_key) DO NOTHING;

-- Next+ tier (₹45k) — advanced features
INSERT INTO public.feature_flags (client_id, tier, feature_key, enabled, description)
VALUES
  ('venkateshwara', 'next_plus', 'offline_mode', true, 'Offline-first mode'),
  ('venkateshwara', 'next_plus', 'product_catalog', true, 'Product catalog dropdown'),
  ('venkateshwara', 'next_plus', 'excel_export', true, 'Excel export'),
  ('venkateshwara', 'next_plus', 'whatsapp_share', true, 'WhatsApp sharing'),
  ('venkateshwara', 'next_plus', 'email_portal', true, 'Email portal'),
  ('venkateshwara', 'next_plus', 'push_notifications', true, 'Push notifications'),
  ('venkateshwara', 'next_plus', 'customer_history', true, 'Customer history screen'),
  ('venkateshwara', 'next_plus', 'site_photos', true, 'Camera site photos'),
  ('venkateshwara', 'next_plus', 'upi_qr', true, 'UPI QR on invoice'),
  ('venkateshwara', 'next_plus', 'gst_invoices', true, 'GST invoices'),
  ('venkateshwara', 'next_plus', 'custom_domain', true, 'Custom domain support'),
  ('venkateshwara', 'next_plus', 'desktop_console', false, 'Branded desktop console'),
  ('venkateshwara', 'next_plus', 'analytics', true, 'Analytics dashboard'),
  ('venkateshwara', 'next_plus', 'multi_user', false, 'Multi-user support'),
  ('venkateshwara', 'next_plus', 'api_access', false, 'API access')
ON CONFLICT (client_id, tier, feature_key) DO NOTHING;

-- Final tier (₹55k) — all features
INSERT INTO public.feature_flags (client_id, tier, feature_key, enabled, description)
VALUES
  ('venkateshwara', 'final', 'offline_mode', true, 'Offline-first mode'),
  ('venkateshwara', 'final', 'product_catalog', true, 'Product catalog dropdown'),
  ('venkateshwara', 'final', 'excel_export', true, 'Excel export'),
  ('venkateshwara', 'final', 'whatsapp_share', true, 'WhatsApp sharing'),
  ('venkateshwara', 'final', 'email_portal', true, 'Email portal'),
  ('venkateshwara', 'final', 'push_notifications', true, 'Push notifications'),
  ('venkateshwara', 'final', 'customer_history', true, 'Customer history screen'),
  ('venkateshwara', 'final', 'site_photos', true, 'Camera site photos'),
  ('venkateshwara', 'final', 'upi_qr', true, 'UPI QR on invoice'),
  ('venkateshwara', 'final', 'gst_invoices', true, 'GST invoices'),
  ('venkateshwara', 'final', 'custom_domain', true, 'Custom domain support'),
  ('venkateshwara', 'final', 'desktop_console', true, 'Branded desktop console'),
  ('venkateshwara', 'final', 'analytics', true, 'Analytics dashboard'),
  ('venkateshwara', 'final', 'multi_user', true, 'Multi-user support'),
  ('venkateshwara', 'final', 'api_access', true, 'API access')
ON CONFLICT (client_id, tier, feature_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_manifest      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags         TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_config_dynamic TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_log              TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. Helper function: bump_content_version()
-- ---------------------------------------------------------------------------
-- Increments the version for a content type and updates last_modified.
-- Called by the console API when content is modified.
CREATE OR REPLACE FUNCTION public.bump_content_version(
  p_client_id    text,
  p_content_type text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version int;
BEGIN
  INSERT INTO public.content_manifest (client_id, content_type, version, last_modified)
  VALUES (p_client_id, p_content_type, 1, now())
  ON CONFLICT (client_id, content_type)
  DO UPDATE SET
    version = content_manifest.version + 1,
    last_modified = now()
  RETURNING content_manifest.version INTO v_version;
  
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.bump_content_version IS
  'Increments the version for a content type. Called by the console API when content is modified.';


-- ---------------------------------------------------------------------------
-- 8. Helper function: get_client_tier()
-- ---------------------------------------------------------------------------
-- Returns the tier for a client. Tier is determined by:
--   1. Explicit tier column in client config (if added later)
--   2. Fallback to 'base' for now (will be updated as tiers are implemented)
CREATE OR REPLACE FUNCTION public.get_client_tier(p_client_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tier text;
BEGIN
  -- For now, return 'base' as default tier
  -- TODO: Add tier column to client table and query it here
  v_tier := 'base';
  
  -- Check if client has a custom tier override
  BEGIN
    SELECT config_value->>'value' INTO v_tier
    FROM public.client_config_dynamic
    WHERE client_id = p_client_id AND config_key = 'tier';
  EXCEPTION WHEN OTHERS THEN
    v_tier := 'base';
  END;
  
  RETURN COALESCE(v_tier, 'base');
END;
$$;

COMMENT ON FUNCTION public.get_client_tier IS
  'Returns the tier for a client. Currently defaults to base. Will be updated as tiers are implemented.';


COMMIT;


NOTIFY pgrst, 'reload schema';
