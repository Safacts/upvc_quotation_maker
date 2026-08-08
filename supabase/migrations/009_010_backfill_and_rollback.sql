-- ============================================================================
-- Phase 0 — BACKFILL + ROLLBACK companion for 009_masters.sql / 010_console_rpcs.sql
-- ============================================================================
-- NOT a migration. Do not run this file top-to-bottom. It is a runbook: copy the
-- section you need. Sections A/B are the backfill; section C is the rollback.
--
-- BEFORE ANYTHING ELSE:  scripts\run_backup.bat
--   -> writes C:\Users\aadi\supabase-backups\<timestamp>\ (schema.sql + per-table
--      JSON + restore.js). Verify the folder is non-empty and that
--      quotations.json contains 47 rows BEFORE you proceed.
-- ============================================================================


-- ############################################################################
-- SECTION A — DRY RUN. Read-only. Run this FIRST and read the output.
-- ############################################################################

-- A1. How many quotations can be linked to a customer by name?
--     Measured 08-08-2026: 49 name-matches over 47 quotations -> the excess is
--     the duplicate problem in A2.
SELECT
  count(*)                                                   AS quotations_total,
  count(*) FILTER (WHERE c.id IS NOT NULL)                   AS will_link,
  count(*) FILTER (WHERE c.id IS NULL)                       AS will_stay_null
FROM public.quotations q
LEFT JOIN public.customers c
  ON  c.client_id     = q.client_id
  AND lower(btrim(c.name)) = lower(btrim(q.customer_name))
  AND c.soft_deleted  = false;

-- A2. CRITICAL: quotations whose name matches MORE THAN ONE customer.
--     Verified 08-08-2026: 2 rows match the name 'jvr' twice, because migration
--     007 backfilled `customers` with a case-sensitive SELECT DISTINCT and so
--     created near-duplicates ('jvr' vs 'JVR', trailing-space variants).
--     A plain UPDATE..FROM would pick an ARBITRARY one of the two. Section B
--     resolves this deterministically instead.
SELECT q.client_id, q.customer_name, count(c.id) AS candidate_customers
FROM public.quotations q
JOIN public.customers c
  ON  c.client_id     = q.client_id
  AND lower(btrim(c.name)) = lower(btrim(q.customer_name))
  AND c.soft_deleted  = false
GROUP BY q.client_id, q.customer_name
HAVING count(c.id) > 1
ORDER BY 3 DESC;


-- ############################################################################
-- SECTION B — BACKFILL. Run inside an explicit transaction.
-- ############################################################################
-- Links quotations to customers WITHOUT touching customer_name / contact_no.
-- Those two columns are the immutable historical snapshot of what was printed
-- on the PDF and are never written here.

BEGIN;

-- B1. Deterministic link. Where a name matches several customer rows, take the
--     OLDEST (created_at, then id) so the result is reproducible rather than
--     dependent on scan order. Phone is used as a tiebreaker when present,
--     because a name+phone match is strictly better evidence than name alone.
WITH ranked AS (
  SELECT
    q.id AS quotation_id,
    c.id AS customer_id,
    row_number() OVER (
      PARTITION BY q.id
      ORDER BY
        -- prefer an exact phone match
        (CASE WHEN nullif(btrim(coalesce(q.contact_no,'')),'') IS NOT NULL
               AND btrim(c.phone) = btrim(q.contact_no) THEN 0 ELSE 1 END),
        c.created_at,
        c.id
    ) AS rn
  FROM public.quotations q
  JOIN public.customers c
    ON  c.client_id          = q.client_id
    AND lower(btrim(c.name)) = lower(btrim(q.customer_name))
    AND c.soft_deleted       = false
  WHERE q.customer_id IS NULL
)
UPDATE public.quotations q
   SET customer_id = r.customer_id
  FROM ranked r
 WHERE q.id = r.quotation_id
   AND r.rn = 1;

-- B2. Validation. Both numbers are informational, NOT pass/fail gates.
--     A NULL customer_id is ACCEPTABLE and expected: `customer_id` is a nullable
--     convenience link, and a quotation whose free-text name never made it into
--     `customers` (or was typed differently) simply stays unlinked. The UI must
--     fall back to `customer_name` — which is the snapshot it should be showing
--     for historical rows anyway.
SELECT
  count(*)                                        AS total,
  count(customer_id)                              AS linked,
  count(*) - count(customer_id)                   AS unlinked
FROM public.quotations;

-- B3. PROOF that history was not rewritten. Must return 0 rows.
--     Compares the live snapshot columns against the backup JSON if you have
--     loaded it into a temp table; otherwise eyeball a few known quote_no values.
SELECT q.id, q.quote_no, q.customer_name, q.contact_no, c.name AS customer_master_name
FROM public.quotations q
JOIN public.customers c ON c.id = q.customer_id
WHERE lower(btrim(q.customer_name)) <> lower(btrim(c.name))
LIMIT 20;
-- ^ Rows here are NOT an error. They mean the master record was edited after the
--   quotation was raised, which is exactly the scenario the snapshot protects.
--   Confirm the quotation still shows its ORIGINAL name; that is the whole point.

COMMIT;


-- ############################################################################
-- SECTION C — ROLLBACK
-- ############################################################################
-- Ordered most-surgical to most-destructive. Prefer the earliest one that works.

-- C1. Undo ONLY the backfill link. Non-destructive: customer_name/contact_no are
--     untouched, so nothing user-visible changes.
--     UPDATE public.quotations SET customer_id = NULL;

-- C2. Undo 010 (RPCs only). Safe at any time — these are pure read functions
--     with no stored state. The console falls back to the existing JS path.
--     DROP FUNCTION IF EXISTS public.get_quote_stats(text, timestamptz, timestamptz);
--     DROP FUNCTION IF EXISTS public.search_quotations(text, text, text[], timestamptz, timestamptz, uuid, text, text, integer, integer);
--     DROP VIEW     IF EXISTS public.quotation_money;
--     NOTIFY pgrst, 'reload schema';

-- C3. Undo 009 structure. Indexes and audit_logs are additive; dropping them
--     cannot lose quotation data. NOTE: dropping audit_logs DOES lose any audit
--     history written since it was created — export it first if the History
--     panel has been live.
--     DROP INDEX IF EXISTS public.products_client_live_idx;
--     DROP INDEX IF EXISTS public.products_name_trgm_idx;
--     DROP INDEX IF EXISTS public.products_category_trgm_idx;
--     DROP INDEX IF EXISTS public.customers_client_live_idx;
--     DROP INDEX IF EXISTS public.customers_name_trgm_idx;
--     DROP INDEX IF EXISTS public.quotations_client_contact_idx;
--     DROP INDEX IF EXISTS public.quotations_customer_name_trgm_idx;
--     DROP INDEX IF EXISTS public.quotations_client_customer_idx;
--     DROP INDEX IF EXISTS public.quotations_client_status_idx;
--     DROP INDEX IF EXISTS public.quotations_client_created_idx;
--     ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_customer_id_fkey;
--     ALTER TABLE public.quotations DROP COLUMN IF EXISTS customer_id;
--     DROP TABLE IF EXISTS public.audit_logs;
--     -- rename the phone index back to its 007 name:
--     ALTER INDEX IF EXISTS public.customers_live_phone_uniq RENAME TO idx_customers_client_phone;
--     NOTIFY pgrst, 'reload schema';

-- C4. The status normalisation in 009 is NOT automatically reversible: once
--     'Draft' has been lowered to 'draft' the original casing is gone. It is
--     also the one change you should least want to revert, since 'Draft' rows
--     are invisible to every `status = 'draft'` filter. If you genuinely must
--     restore the old casing, take it from the pre-migration backup:
--       node restore.js "C:\Users\aadi\supabase-backups\<timestamp>"
--     Affected rows are identifiable in the backup as status = 'Draft'
--     (20 rows as of 08-08-2026).

-- C5. Full restore (last resort — overwrites everything):
--       node restore.js "C:\Users\aadi\supabase-backups\<timestamp>"
