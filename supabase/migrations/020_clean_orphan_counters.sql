-- ============================================================================
-- Migration 020 -- Clean orphan quotation_counters
-- ============================================================================
-- These two client_ids have rows in quotation_counters but NO matching row in
-- clients. They were created during early testing / migration 016 testing and
-- never cleaned up. quotation_counters has no FK to clients, so they persist.
--
-- Verified orphaned on both production and staging (09-08-2026):
--   brand-new-co:                    next_val=1  (test tenant, never promoted)
--   venkateshwara-upvc-windows-doors: next_val=105 (old slug, superseded by 'venkateshwara')
--
-- IDEMPOTENT -- safe to re-run (DELETE WHERE IN matching 0 rows is a no-op).
-- ============================================================================

BEGIN;

DELETE FROM public.quotation_counters
WHERE client_id IN ('brand-new-co', 'venkateshwara-upvc-windows-doors');

COMMIT;

NOTIFY pgrst, 'reload schema';
