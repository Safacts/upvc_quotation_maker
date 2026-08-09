-- ============================================================================
-- Migration 015 - Drop "Allow public all" on customers (PII exposure fix)
-- ============================================================================
-- RISK BEING FIXED:
--   The policy "Allow public all on customers" was created by migration 007 as
--   FOR ALL USING (true) WITH CHECK (true) with no role restriction. Because
--   Postgres RLS combines PERMISSIVE policies with OR, that single policy made
--   the far stricter "client_isolation_customers" policy irrelevant: any caller
--   holding only the public anon key could hit
--     GET /rest/v1/customers?select=*
--   with NO x-client-id header and read EVERY tenant's customer records -
--   name, phone, email, company, address and gst_number. That is direct PII
--   (and GSTIN) disclosure across all clients.
--
-- WHAT REMAINS AFTER THIS MIGRATION:
--   * client_isolation_customers            - anon/authenticated, rows limited to
--                                             client_id = request header x-client-id
--   * Allow service_role full access on customers - server-side/admin paths
--   Result: an unauthenticated caller with no x-client-id gets 0 rows; the
--   Flutter app and Next.js client pages (which always send x-client-id) keep
--   working unchanged.
--
-- SCOPE NOTE: public.products keeps its "Allow public all" policy on purpose -
-- it holds no PII and is out of scope for this migration.
--
-- ASCII-ONLY, NO BOM.
-- TAKE A BACKUP FIRST: scripts\run_backup.bat
-- Apply via the pooler with: node scripts/apply_migration_015.js production
--                            node scripts/apply_migration_015.js staging
-- ============================================================================

BEGIN;

-- The leak: any anon caller with just the REST URL + anon key can read
-- every customer's name, phone, email, company, address, and gst_number
-- WITHOUT sending an x-client-id header.
DROP POLICY IF EXISTS "Allow public all on customers" ON public.customers;

-- client_isolation_customers + service_role full access remain.
-- After this, an unauthenticated caller gets 0 rows; a correctly-configured
-- Flutter app (which sends x-client-id) still works via client_isolation_customers.

COMMIT;

-- Make PostgREST pick up the policy change immediately.
NOTIFY pgrst, 'reload schema';
