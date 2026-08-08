-- ============================================================================
-- Migration 009 — Phase 0 masters (audit_logs, quotations.customer_id, indexes)
-- ============================================================================
--
-- RENUMBERING NOTICE (read before you go looking for `007_masters.sql`):
--   The Phase 0 ticket asked for `007_masters.sql` + `008_console_rpcs.sql`.
--   Those numbers were ALREADY USED and ALREADY APPLIED to the live database on
--   08-08-2026:
--       007_customers.sql  -> `customers` table (25 rows backfilled, live)
--       008_products.sql   -> `products`  table (0 rows, live)
--   Re-using 007/008 would have silently overwritten the recorded history of DDL
--   that is already running in production. This file is therefore the DELTA
--   between what 007/008 actually created and what the Phase 0 spec requires.
--
-- SCOPE / RLS CONTRACT
--   Tenant scope is enforced in the APPLICATION LAYER via the service-role
--   `client_id` filter, NOT via RLS. The service-role key bypasses RLS entirely,
--   so `.eq("client_id", clientId)` in the API route IS the isolation boundary.
--   The policies below exist to (a) keep the anon-key Flutter app working and
--   (b) provide defense-in-depth for direct REST access. They match the
--   convention established in 006_secure_quotations.sql.
--
-- IDEMPOTENT — safe to re-run. Apply via the pooler
--   host aws-1-ap-south-1.pooler.supabase.com:5432
--   user postgres.effxrwrbsjduvhmorvrq
-- then run:  NOTIFY pgrst, 'reload schema';
--
-- TAKE A BACKUP FIRST:  scripts\run_backup.bat
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
-- pg_trgm powers partial/fuzzy customer-name search in `search_quotations`.
-- Verified NOT installed as of 08-08-2026 (only pgcrypto was present).
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ---------------------------------------------------------------------------
-- 1. audit_logs
-- ---------------------------------------------------------------------------
-- A TABLE, deliberately NOT a set of Postgres triggers.
--
-- Rationale (Nexy's call, and I agree): triggers are invisible to application
-- code. Scribe needs a user-visible "History" panel, which means the app must be
-- able to read, filter and paginate these rows and attach a meaningful `actor`.
-- A trigger only ever sees the database role (`service_role`) — it cannot know
-- WHICH human clicked the button. Writing the row from the API layer, where the
-- session is known, is the only way `actor` carries real information.
--
-- The cost of this choice is that a write which bypasses the API is not audited.
-- That is an accepted trade-off: the console is the only write path for the
-- surfaces this panel covers.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text        NOT NULL,
  entity_type  text        NOT NULL,           -- 'quotation' | 'customer' | 'product' | ...
  entity_id    text        NOT NULL,           -- text, not uuid: some entities are keyed by quote_no
  action       text        NOT NULL,           -- 'create' | 'update' | 'delete' | 'status_change' | ...
  old_value    jsonb       NULL,               -- NULL on create
  new_value    jsonb       NULL,               -- NULL on delete
  actor        text        NOT NULL DEFAULT '',-- who did it (email / client_id / 'system')
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The History panel always reads "this tenant, newest first".
CREATE INDEX IF NOT EXISTS audit_logs_client_created_idx
  ON public.audit_logs (client_id, created_at DESC);

-- Drill-down: "show me everything that ever happened to THIS quotation".
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (client_id, entity_type, entity_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on audit_logs" ON public.audit_logs;
CREATE POLICY "Allow public all on audit_logs"
    ON public.audit_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on audit_logs" ON public.audit_logs;
CREATE POLICY "Allow service_role full access on audit_logs"
    ON public.audit_logs
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_audit_logs" ON public.audit_logs;
CREATE POLICY "client_isolation_audit_logs"
    ON public.audit_logs
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


-- ---------------------------------------------------------------------------
-- 2. quotations.customer_id — ADDITIVE ONLY
-- ---------------------------------------------------------------------------
-- HARD REQUIREMENT: `customer_name` / `contact_no` stay exactly as they are.
--
-- They are an IMMUTABLE HISTORICAL SNAPSHOT of what was printed on the PDF the
-- customer actually received. If a customer later changes their phone number,
-- an old quotation MUST still show the number that was on the paper. Replacing
-- these columns with a join to `customers` would silently rewrite history and
-- make a two-year-old quotation disagree with the PDF in the customer's inbox.
--
-- `customer_id` is therefore a NULLABLE, purely ADDITIVE link used for
-- navigation and aggregation ("show me every quote for this customer"), never
-- for display of historical values.
--
-- ON DELETE SET NULL: `customers` supports soft-delete, so a hard delete should
-- be rare — but if one ever happens it must NOT cascade into the quotation
-- ledger. Losing the link is survivable; losing the quotation is not.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_customer_id_fkey'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Legacy status normalisation
-- ---------------------------------------------------------------------------
-- VERIFIED AGAINST LIVE DATA 08-08-2026 — `quotations.status` currently holds:
--     'draft' = 20,  'Draft' = 20,  'sent' = 6,  'won' = 1
--
-- The canonical values are LOWERCASE ('draft' | 'sent' | 'won' | 'lost'), per
-- `QuotationStatusX.value` in lib/models.dart. The capitalised 'Draft' rows are
-- legacy: the old column DEFAULT was 'Draft'::text and pre-dates the enum.
--
-- This is not cosmetic. The Flutter app survives it only because
-- `QuotationStatusX.fromString` falls through to `draft` for anything it does
-- not recognise, and portal_stats/route.ts re-capitalises in JS. But ANY SQL
-- filter of the form `status = 'draft'` silently MISSES 20 of 47 rows — that is
-- half the table vanishing from the Quotations grid and every report.
--
-- Normalising the stored data is safe and information-preserving: 'Draft' and
-- 'draft' already mean the identical thing to every consumer.
UPDATE public.quotations
   SET status = lower(btrim(status))
 WHERE status IS DISTINCT FROM lower(btrim(status));

-- Stop the old capitalised default from reintroducing the problem on new rows.
ALTER TABLE public.quotations ALTER COLUMN status SET DEFAULT 'draft';


-- ---------------------------------------------------------------------------
-- 4. Indexes on quotations
-- ---------------------------------------------------------------------------
-- Grid default view + the paged `created_at.desc,id.desc` read in portal_stats.
CREATE INDEX IF NOT EXISTS quotations_client_created_idx
  ON public.quotations (client_id, created_at DESC);

-- Status facet. Indexed on lower(status) rather than status: even after the
-- normalisation above, an old APK build or a manual insert can still write
-- 'Draft', and `search_quotations` filters on lower(status). A plain
-- (client_id, status) index would simply not be used by that predicate.
CREATE INDEX IF NOT EXISTS quotations_client_status_idx
  ON public.quotations (client_id, lower(status));

-- Customer Ledger drill-down: WHERE client_id = $1 AND customer_id = $2.
CREATE INDEX IF NOT EXISTS quotations_client_customer_idx
  ON public.quotations (client_id, customer_id);

-- Partial free-text search on the historical snapshot name.
CREATE INDEX IF NOT EXISTS quotations_customer_name_trgm_idx
  ON public.quotations USING gin (customer_name gin_trgm_ops);

-- Exact-ish phone lookup. Deliberately B-tree, NOT trigram: trigram indexes
-- perform badly on 10-digit numeric strings because the trigram set is tiny and
-- massively non-selective across a phone book.
CREATE INDEX IF NOT EXISTS quotations_client_contact_idx
  ON public.quotations (client_id, contact_no);


-- ---------------------------------------------------------------------------
-- 5. Reconcile `customers` with the Phase 0 spec
-- ---------------------------------------------------------------------------
-- The spec calls for:
--   customers_live_phone_uniq ON customers (client_id, phone)
--     WHERE phone IS NOT NULL AND soft_deleted = false
--
-- THE SPEC PREDICATE AS WRITTEN CANNOT BE CREATED ON THIS DATABASE.
-- `customers.phone` is NOT NULL DEFAULT '' (migration 007), so `phone IS NOT
-- NULL` is true for every row. Live data has 8 rows with an EMPTY phone, 7 of
-- them under client_id 'kprupvc' — verified 08-08-2026. Creating that index
-- would abort with a duplicate key error on ''.
--
-- `phone <> ''` is the predicate that expresses the actual intent ("customers
-- who have a phone number"), and it is what migration 007 already shipped.
-- Below we simply RENAME 007's index to the agreed spec name rather than
-- creating a second, redundant copy of it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_customers_client_phone')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customers_live_phone_uniq')
  THEN
    ALTER INDEX public.idx_customers_client_phone RENAME TO customers_live_phone_uniq;
  END IF;
END $$;

-- Fallback: if 007's index is somehow absent, create it under the spec name
-- with the corrected, actually-creatable predicate.
CREATE UNIQUE INDEX IF NOT EXISTS customers_live_phone_uniq
  ON public.customers (client_id, phone)
  WHERE phone IS NOT NULL AND phone <> '' AND soft_deleted = false;

-- Customer search by name (autocomplete in the quotation editor).
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON public.customers USING gin (name gin_trgm_ops);

-- The live-customer list is always "this tenant, not deleted".
CREATE INDEX IF NOT EXISTS customers_client_live_idx
  ON public.customers (client_id) WHERE soft_deleted = false;


-- ---------------------------------------------------------------------------
-- 6. Reconcile `products` with the Phase 0 spec
-- ---------------------------------------------------------------------------
-- `category` stays free-text `text`, NOT an enum. KPR will invent categories we
-- did not anticipate ("Mesh", "Hardware", "Glass"); free text plus a UI
-- autocomplete over `SELECT DISTINCT category` costs nothing, whereas an enum
-- costs a migration every single time a fabricator types a new word.
CREATE INDEX IF NOT EXISTS products_category_trgm_idx
  ON public.products USING gin (category gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_client_live_idx
  ON public.products (client_id) WHERE soft_deleted = false;

COMMIT;

NOTIFY pgrst, 'reload schema';
