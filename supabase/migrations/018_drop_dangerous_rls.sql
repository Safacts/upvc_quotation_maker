-- ============================================================================
-- Migration 018 -- Drop Allow public all on products + audit_logs
-- ============================================================================
-- These policies were created by migrations 008 and 009. They use
-- USING (true) WITH CHECK (true), which OR-combines past the
-- client_isolation_* policies and lets ANY anon key read ALL tenants' data.
--
-- Same class as the customers PII leak fixed in migration 015.
--
-- IDEMPOTENT -- safe to re-run.
-- ============================================================================

BEGIN;

-- products: 0 rows currently, but any future product inserts would be publicly readable
DROP POLICY IF EXISTS "Allow public all on products" ON public.products;

-- audit_logs: 0 rows currently, but holds old_value/new_value JSONB -- high risk when populated
DROP POLICY IF EXISTS "Allow public all on audit_logs" ON public.audit_logs;

COMMIT;

NOTIFY pgrst, 'reload schema';
