-- ============================================================================
-- Migration 013 — Add missing indexes for query performance
-- ============================================================================
--
-- SCOPE
--   The `quotation_money` view (010/011) and `search_quotations` RPC join
--   `quotations` -> `measured_items` / `unmeasured_items` on `quotation_id`.
--   These joins were running without indexes, causing sequential scans on
--   growing tables (currently ~200 measured_items, ~24 unmeasured_items).
--
--   Also adds a composite index on `sent_emails` for the admin invoice email
--   lookup pattern.
--
-- PREREQUISITES
--   006_secure_quotations.sql (base tables)
--
-- IDEMPOTENT — safe to re-run. Apply via the pooler
--   host aws-0-ap-northeast-1.pooler.supabase.com:5432
--   user postgres.gumpmnbjdtzajhysnnaz
-- then run:  NOTIFY pgrst, 'reload schema';
--
-- TAKE A BACKUP FIRST:  scripts\run_backup.bat
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. measured_items.quotation_id — drives the LEFT JOIN LATERAL in
--    quotation_money view and search_quotations RPC.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_measured_items_quotation_id
  ON public.measured_items (quotation_id);

-- ---------------------------------------------------------------------------
-- 2. unmeasured_items.quotation_id — same reason as above.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_unmeasured_items_quotation_id
  ON public.unmeasured_items (quotation_id);

-- ---------------------------------------------------------------------------
-- 3. sent_emails composite index for admin invoice email lookups.
--    Pattern: WHERE client_id = $1 AND quotation_id = $2 ORDER BY sent_at DESC
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sent_emails_client_quotation_sent
  ON public.sent_emails (client_id, quotation_id, sent_at DESC);

-- ---------------------------------------------------------------------------
-- 4. vitharn_invoice_items.invoice_id — similar join pattern.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vitharn_invoice_items_invoice_id
  ON public.vitharn_invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- 5. gst_invoice_items.invoice_id — already has idx_gst_invoice_items_invoice_id
--    from 004, but verify it exists.
-- ---------------------------------------------------------------------------
-- (Already created in 004_gst_invoices.sql)

-- ---------------------------------------------------------------------------
-- 6. quotation_counters.client_id — already has PK on client_id, but adding
--    for clarity.
-- ---------------------------------------------------------------------------
-- PK on (client_id) already covers this.

COMMIT;

NOTIFY pgrst, 'reload schema';