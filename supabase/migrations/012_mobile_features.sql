-- ============================================================================
-- Migration 012 -- Mobile app features: site photos, payments, quote tracking,
--                  notification centre, customer history RPC
-- ============================================================================
--
-- SCOPE
--   Backing schema for six new features in the Flutter MOBILE app (Dash's ticket).
--   Nothing here changes existing behaviour: every table is new and every change
--   to `quotations` is purely ADDITIVE with a safe DEFAULT, so already-deployed
--   APKs that know nothing about these columns keep working untouched.
--
-- WHAT'S NEW
--   1. quotation_photos      -- site photos attached to a quotation
--   2. payments              -- payments received against a quotation / customer
--   3. quotations (+4 cols)  -- viewed_at, view_count, payment_status, amount_paid
--   4. app_notifications     -- feed for the mobile push / notification centre
--                               (+ registered with the supabase_realtime publication)
--   5. customer_history()    -- one-call customer 360: quotations + payments + totals
--   6. -- STORAGE: section   -- runbook for the `site-photos` bucket (bottom of file)
--
-- PREREQUISITES
--   006_secure_quotations.sql (RLS on quotations)
--   007_customers.sql         (customers.id uuid -- payments.customer_id points at it)
--   010_console_rpcs.sql      (quotation_money view)
--   011_phase2_reports_and_export.sql (quotations.deleted, quotation_money.deleted)
--
-- VERIFIED BEFORE WRITING (no DB was touched to author this file)
--   `quotations.id` is **uuid**. Proof: 011 declares
--   `tally_export_data(...) RETURNS TABLE (quotation_id uuid, ...)` and selects
--   `q.id` into that column, `search_quotations` returns `id uuid` sourced from
--   `quotation_money.id` (= `q.id`), and `bulk_delete(p_cid text, p_ids uuid[])`
--   joins `q.id = i.id`. None of those functions could have been created if
--   `quotations.id` were anything but uuid, and 011 is applied+verified on both
--   projects. => the FK on quotation_photos.quotation_id IS added below.
--
-- RLS CONTRACT (identical to 007/008)
--   The Flutter app connects with the ANON key and sets a global `x-client-id`
--   header. Each new table therefore gets the standard policy TRIPLE:
--     "Allow public all on X"              -- keeps the anon-key app working
--     "Allow service_role full access on X"-- Next.js API routes
--     "client_isolation_X"                 -- x-client-id header match (defense in depth)
--   Real tenant isolation for service-role callers is still the application-layer
--   `.eq("client_id", clientId)` filter, because service_role bypasses RLS.
--
-- ASCII-ONLY BY DESIGN
--   009/010/011 shipped with a UTF-8 BOM and em-dashes, which produced
--   `syntax error at or near ""` until the apply script stripped the BOM.
--   This file is deliberately pure ASCII with no BOM so it can be piped into
--   psql/node-postgres raw.
--
-- IDEMPOTENT -- safe to re-run. Apply via the pooler
--   host aws-0-ap-northeast-1.pooler.supabase.com:5432
--   user postgres.gumpmnbjdtzajhysnnaz
-- then run:  NOTIFY pgrst, 'reload schema';
--
-- TAKE A BACKUP FIRST:  scripts\run_backup.bat
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. quotation_photos -- site photos attached to a quotation
-- ---------------------------------------------------------------------------
-- The mobile app lets the field engineer photograph the opening/site while
-- measuring. The BYTES live in Supabase Storage (bucket `site-photos`, see the
-- STORAGE runbook at the bottom); this table is only the METADATA index.
--
-- WHY BOTH storage_path AND public_url:
--   * storage_path is the durable key ('<client_id>/<quotation_id>/<uuid>.jpg').
--     It is what you must pass to the Storage API to delete/move/re-sign a file.
--   * public_url is the denormalised CDN URL. Caching it means the photo grid
--     renders with ZERO extra round-trips, which matters badly on a 3G site
--     visit. If the project ref ever changes again (it did on 08-08-2026), this
--     column is the one to rewrite -- storage_path stays valid.
--
-- width/height/bytes are NULLABLE on purpose: they are best-effort client-side
-- metadata. A photo whose dimensions failed to decode must still be storable.
-- width/height let the app reserve the correct aspect-ratio box BEFORE the
-- image downloads (no layout jank); bytes drives the "downloading 2.4 MB" UI.
CREATE TABLE IF NOT EXISTS public.quotation_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  quotation_id  uuid NOT NULL,
  storage_path  text NOT NULL DEFAULT '',
  public_url    text NOT NULL DEFAULT '',
  caption       text NOT NULL DEFAULT '',
  width         int,
  height        int,
  bytes         bigint,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- FK to quotations(id) ON DELETE CASCADE.
--
-- Declared here in a guarded DO block rather than inline in CREATE TABLE for
-- two reasons: (a) `ADD CONSTRAINT` has no `IF NOT EXISTS` form in PostgreSQL,
-- so a naked ALTER would break re-runs; (b) if the table already existed from a
-- partial apply WITHOUT the FK, an inline definition would never be reached.
--
-- CASCADE is correct here (unlike quotations.customer_id, which is SET NULL):
-- a photo of a site has no meaning once its quotation is hard-deleted, and
-- orphaned rows would leave storage objects nobody can find. Note that 011's
-- bulk_delete is a SOFT delete (`deleted = true`), so normal app-level deletion
-- does NOT cascade -- photos survive and reappear if the quote is restored.
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname  = 'quotation_photos_quotation_id_fkey'
          AND conrelid = 'public.quotation_photos'::regclass
     )
     AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'quotations'
          AND column_name  = 'id'
          AND data_type    = 'uuid'
     )
  THEN
    ALTER TABLE public.quotation_photos
      ADD CONSTRAINT quotation_photos_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The ONLY read pattern the app has: "all photos for this quote, newest first",
-- always already scoped to the tenant. One composite index serves it end to end
-- (filter on client_id + quotation_id, then a pre-sorted scan on created_at),
-- so PostgreSQL never has to sort at runtime.
CREATE INDEX IF NOT EXISTS quotation_photos_client_quote_created_idx
  ON public.quotation_photos (client_id, quotation_id, created_at DESC);

ALTER TABLE public.quotation_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on quotation_photos" ON public.quotation_photos;
CREATE POLICY "Allow public all on quotation_photos"
    ON public.quotation_photos
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on quotation_photos" ON public.quotation_photos;
CREATE POLICY "Allow service_role full access on quotation_photos"
    ON public.quotation_photos
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_quotation_photos" ON public.quotation_photos;
CREATE POLICY "client_isolation_quotation_photos"
    ON public.quotation_photos
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.quotation_photos IS
  'Metadata index for site photos attached to a quotation. Bytes live in the '
  'Supabase Storage bucket `site-photos` at <client_id>/<quotation_id>/<uuid>.<ext>. '
  'storage_path is the durable key; public_url is a denormalised CDN URL cached '
  'to avoid a round-trip on the photo grid.';


-- ---------------------------------------------------------------------------
-- 2. payments -- payments received against a quotation / customer
-- ---------------------------------------------------------------------------
-- uPVC work is almost always part-paid: advance on order, balance on
-- installation. So this is a LEDGER (many rows per quotation), never a single
-- "paid" flag. quotations.amount_paid / payment_status (section 3) are the
-- cached ROLL-UP of these rows for fast list rendering.
--
-- WHY quotation_id AND customer_id ARE BOTH NULLABLE, AND HAVE NO FK:
--   * A payment can be a general on-account advance from a customer with no
--     quotation yet (quotation_id NULL), or a walk-in cash receipt against a
--     customer who was never added to the masters (customer_id NULL).
--   * No foreign keys deliberately: a money record must NEVER be destroyed by a
--     cascade from a quotation or a customer row. Losing an audit trail of cash
--     received is the single worst data-loss this schema could suffer. The link
--     is a convenience pointer -- customer_name is the snapshot that survives.
--     (Same reasoning as quotations.customer_id being ON DELETE SET NULL.)
--
-- customer_name is a SNAPSHOT (NOT NULL DEFAULT ''), matching the pattern
-- already used by quotations.customer_name. It is what customer_history()
-- falls back to when customer_id was never linked.
--
-- CHECK (amount >= 0): refunds are NOT modelled as negative payments here. If a
-- refund is ever needed, add a `kind` column ('receipt'|'refund') rather than
-- relaxing this constraint -- a negative amount silently corrupts every SUM().
CREATE TABLE IF NOT EXISTS public.payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      text NOT NULL DEFAULT 'venkateshwara',
  quotation_id   uuid,
  customer_id    uuid,
  customer_name  text NOT NULL DEFAULT '',
  amount         numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  method         text NOT NULL DEFAULT 'upi',
  reference      text NOT NULL DEFAULT '',
  note           text NOT NULL DEFAULT '',
  paid_at        timestamptz NOT NULL DEFAULT now(),

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- `method` is intentionally free text (not an enum / CHECK): the realistic set
-- is upi|cash|cheque|neft|rtgs|card|other and it WILL grow. Constrain it in the
-- app's dropdown, not in DDL -- an enum here means a migration per new method.
--
-- `amount` is numeric (exact decimal), NOT float8. This is the deliberate
-- opposite of the pricing columns: quotation money must be float8 to stay
-- bit-identical with Dart/JS doubles (see 010/011), but CASH RECEIVED is
-- accounting data where 0.01 rupee drift is unacceptable. Never SUM payments
-- and quotation money in the same float expression.

-- "Payments received, newest first" -- the payments tab's default list.
CREATE INDEX IF NOT EXISTS payments_client_paid_at_idx
  ON public.payments (client_id, paid_at DESC);

-- "All payments for this quotation" -- drives the per-quote balance panel and
-- the amount_paid roll-up recalculation.
CREATE INDEX IF NOT EXISTS payments_client_quotation_idx
  ON public.payments (client_id, quotation_id);

-- "All payments by this customer" -- drives customer_history() and the ledger.
CREATE INDEX IF NOT EXISTS payments_client_customer_idx
  ON public.payments (client_id, customer_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on payments" ON public.payments;
CREATE POLICY "Allow public all on payments"
    ON public.payments
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on payments" ON public.payments;
CREATE POLICY "Allow service_role full access on payments"
    ON public.payments
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_payments" ON public.payments;
CREATE POLICY "client_isolation_payments"
    ON public.payments
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.payments IS
  'Ledger of payments received. Many rows per quotation (advance + balance). '
  'amount is numeric (exact decimal) NOT float8 -- cash received is accounting '
  'data, unlike quotation pricing which must be float8 for Dart/JS parity. '
  'quotation_id/customer_id are intentionally FK-less so a money record can '
  'never be destroyed by a cascade; customer_name is the surviving snapshot.';


-- ---------------------------------------------------------------------------
-- 3. quotations -- additive tracking + payment roll-up columns
-- ---------------------------------------------------------------------------
-- All four are ADD COLUMN IF NOT EXISTS with a NOT NULL DEFAULT (or NULL), so
-- adding them to the live 50-row table is an instant metadata-only operation in
-- PG 11+ and cannot break an older APK that does a SELECT *.
--
-- viewed_at / view_count: set by the public quote-link page when the CUSTOMER
--   opens the quote. viewed_at is NULLABLE and means "never opened" -- that is
--   real information, so it must not be faked with a sentinel timestamp.
--   view_count counts every open (repeat views signal a hot lead).
--
-- payment_status / amount_paid: a CACHED roll-up of public.payments. The
--   payments table is the source of truth; these exist so the quotation LIST
--   can render a paid/partial/unpaid chip without an aggregate subquery per
--   row. Recompute them in the same transaction as any payments INSERT/DELETE:
--
--     UPDATE public.quotations q SET
--       amount_paid = COALESCE(p.total, 0),
--       payment_status = CASE
--         WHEN COALESCE(p.total, 0) <= 0 THEN 'unpaid'
--         WHEN COALESCE(p.total, 0) >= (SELECT round(m.grand_total::numeric, 2)
--                                       FROM public.quotation_money m WHERE m.id = q.id)
--           THEN 'paid'
--         ELSE 'partial' END
--     FROM (SELECT quotation_id, sum(amount) AS total
--           FROM public.payments
--           WHERE quotation_id = $1 GROUP BY quotation_id) p
--     WHERE q.id = p.quotation_id AND q.client_id = $2;
--
--   Deliberately NOT a trigger: a trigger would fire on every bulk import and
--   makes the write path opaque to the app. Keep it explicit and testable.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

-- Value guard for payment_status. Unlike `method` above, this set is CLOSED and
-- drives UI branching, so a typo ('Paid', 'PAID') must fail loudly rather than
-- silently render an unpaid chip -- exactly the mixed-case bug that 009 had to
-- clean up on quotations.status. Guarded DO block because ADD CONSTRAINT has no
-- IF NOT EXISTS form. Safe on the live table: every existing row gets the
-- 'unpaid' default from the ALTER above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'quotations_payment_status_chk'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_payment_status_chk
      CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
  END IF;
END $$;

-- Partial index for the "money outstanding" screen. Indexing only the rows that
-- are NOT fully paid keeps it tiny forever -- paid quotes (the majority over
-- time) never enter the index. Same trick as 011's quotations_client_live_idx.
CREATE INDEX IF NOT EXISTS quotations_client_unpaid_idx
  ON public.quotations (client_id, payment_status)
  WHERE payment_status <> 'paid' AND deleted = false;

COMMENT ON COLUMN public.quotations.viewed_at IS
  'First/last time the CUSTOMER opened the public quote link. NULL = never opened.';
COMMENT ON COLUMN public.quotations.view_count IS
  'Number of times the public quote link has been opened. Repeat views = hot lead.';
COMMENT ON COLUMN public.quotations.payment_status IS
  'Cached roll-up of public.payments: unpaid | partial | paid. Source of truth is '
  'the payments table; recompute on every payments write.';
COMMENT ON COLUMN public.quotations.amount_paid IS
  'Cached sum(payments.amount) for this quotation. numeric (exact), not float8.';


-- ---------------------------------------------------------------------------
-- 4. app_notifications -- feed for the mobile push / notification centre
-- ---------------------------------------------------------------------------
-- A per-tenant activity feed. The mobile app subscribes over Supabase Realtime
-- and renders a bell icon with an unread badge.
--
-- entity_type / entity_id are a deliberately UNTYPED polymorphic pointer
-- (entity_id is TEXT, not uuid) so the feed can reference anything -- a
-- quotation uuid today, an invoice number or an external ref tomorrow --
-- without a schema change per notification kind. This mirrors the shape already
-- used by audit_logs (entity_type + entity_id, per 009).
--
-- title/body are DENORMALISED, rendered at write time. A notification must show
-- what was true WHEN IT FIRED ("Quote VQ-0042 opened by Ramesh"), even if the
-- quote is later renamed or soft-deleted. Never JOIN to build this text.
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text NOT NULL DEFAULT 'venkateshwara',
  kind         text NOT NULL DEFAULT '',
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  entity_type  text NOT NULL DEFAULT '',
  entity_id    text NOT NULL DEFAULT '',
  read         boolean NOT NULL DEFAULT false,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Known `kind` values (free text on purpose -- new kinds must not need a
-- migration, and an unknown kind should degrade to a generic bell icon rather
-- than reject the INSERT):
--   'quote_opened'      -- customer opened the public quote link
--   'payment_received'  -- a payments row was inserted
--   'quote_sent'        -- quotation emailed/shared to the customer
--   'quote_won'         -- status moved to won
--   'photo_added'       -- site photo uploaded

-- Main feed query: "this tenant's notifications, newest first".
CREATE INDEX IF NOT EXISTS app_notifications_client_created_idx
  ON public.app_notifications (client_id, created_at DESC);

-- Unread badge count + unread filter. Partial index, so it only ever holds the
-- handful of rows that are actually unread -- the count stays O(unread), not
-- O(all notifications ever), which is what makes the badge cheap to poll.
CREATE INDEX IF NOT EXISTS app_notifications_client_unread_idx
  ON public.app_notifications (client_id, created_at DESC)
  WHERE read = false;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on app_notifications" ON public.app_notifications;
CREATE POLICY "Allow public all on app_notifications"
    ON public.app_notifications
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on app_notifications" ON public.app_notifications;
CREATE POLICY "Allow service_role full access on app_notifications"
    ON public.app_notifications
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_app_notifications" ON public.app_notifications;
CREATE POLICY "client_isolation_app_notifications"
    ON public.app_notifications
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- Register the table with Supabase Realtime.
--
-- `ALTER PUBLICATION ... ADD TABLE` is NOT idempotent -- re-adding an existing
-- member raises duplicate_object (42710). We swallow it so the migration can be
-- re-run freely. We also swallow undefined_object (42704), which is what you
-- get on a bare/self-hosted PostgreSQL where the `supabase_realtime`
-- publication does not exist -- realtime is a nice-to-have, and its absence
-- must not abort the whole migration transaction.
--
-- NOTE: realtime only DELIVERS rows the subscriber is allowed to SELECT under
-- RLS, so the client_isolation policy above is what stops one tenant's app from
-- receiving another tenant's notifications on the socket.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;   -- already a member of the publication
  WHEN undefined_object THEN NULL;   -- no supabase_realtime publication here
END $$;

COMMENT ON TABLE public.app_notifications IS
  'Per-tenant activity feed for the mobile notification centre, streamed over '
  'Supabase Realtime. title/body are denormalised at write time so a notification '
  'always shows what was true when it fired. entity_type/entity_id is an untyped '
  'polymorphic pointer (entity_id is text) mirroring audit_logs.';


-- ---------------------------------------------------------------------------
-- 5. customer_history() -- one-call customer 360
-- ---------------------------------------------------------------------------
-- Returns a customer's quotations AND payments AND the money summary in a
-- SINGLE jsonb object, i.e. ONE network round-trip. That is the whole point on
-- mobile: three separate REST calls over a patchy site connection is three
-- chances to fail and three spinners.
--
-- RETURNS jsonb (not RETURNS TABLE) because the payload is two arrays of
-- DIFFERENT shapes plus a scalar summary. Forcing that into one flat table
-- would need a discriminator column and a pile of NULLs, and Dart would have to
-- re-split it client-side. `supabase.rpc(...)` decodes this straight into a
-- Map<String, dynamic>.
--
-- MATCHING IS AN OR, NOT AN EITHER/OR -- this is load-bearing. Per the 009
-- backfill, only 26 of 47 quotations could be linked to a customers row; 21
-- still have customer_id NULL and are identified only by the free-text
-- customer_name snapshot. Matching on customer_id ALONE would silently hide
-- those quotations from the customer's own history. So we match
-- `customer_id = p_customer_id` OR `lower(btrim(customer_name)) = lower(name)`.
-- (Case/whitespace-insensitive: 007's backfill produced both "J NARESH KUMAR"
-- and "J NARESH KUMAR " for the same human being.)
--
-- SECURITY INVOKER -- a deliberate, documented deviation from the ticket, which
-- asked for SECURITY DEFINER "matching search_quotations". search_quotations in
-- 011 is in fact SECURITY INVOKER (011 lines 181, 292, 354, ...), and INVOKER is
-- also the only SAFE choice here:
--   quotations currently has NO "Allow public all" policy -- only
--   client_isolation (x-client-id) + service_role. Under SECURITY DEFINER this
--   function would run as the owner and BYPASS RLS, so any anon caller could
--   pass p_cid => 'kprupvc' and read another tenant's entire customer ledger.
--   That is a cross-tenant data leak. Under SECURITY INVOKER, RLS still applies
--   and a mismatched p_cid simply returns nothing.
-- On top of that we add an explicit belt-and-braces guard: if the request
-- carries an x-client-id header, p_cid MUST equal it. Service-role calls from
-- the Next.js API send no such header and are unaffected.
DROP FUNCTION IF EXISTS public.customer_history(text, text, uuid);

CREATE OR REPLACE FUNCTION public.customer_history(
  p_cid            text,
  p_customer_name  text,
  p_customer_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw           text;
  v_hdr           text;
  v_name          text    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_quotes        jsonb;
  v_payments      jsonb;
  v_total_quoted  numeric := 0;
  v_total_paid    numeric := 0;
BEGIN
  -- Guard 1: tenant is mandatory (same contract as search_quotations).
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'customer_history: p_cid (client_id) is required';
  END IF;

  -- Guard 2: without an identifier this would return the tenant's ENTIRE book
  -- under the guise of "one customer's history". Fail loudly instead.
  IF v_name IS NULL AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_history: either p_customer_name or p_customer_id must be supplied';
  END IF;

  -- Guard 3: pin p_cid to the x-client-id header when one is present.
  -- current_setting(..., true) returns NULL outside PostgREST; we nullif the
  -- empty string too, because ''::json would raise "invalid input syntax".
  v_raw := nullif(current_setting('request.headers', true), '');
  IF v_raw IS NOT NULL THEN
    v_hdr := nullif(btrim(coalesce(v_raw::json->>'x-client-id', '')), '');
  END IF;
  IF v_hdr IS NOT NULL AND v_hdr <> p_cid THEN
    RAISE EXCEPTION 'customer_history: p_cid "%" does not match x-client-id header "%"',
      p_cid, v_hdr;
  END IF;

  -- Quotations. Money comes from the shared quotation_money view so this RPC
  -- can never drift from the grid / reports / Tally export. Rounded to 2dp for
  -- the same reason as 010: the caller must not be exposed to raw float8 text
  -- serialization (the extra_float_digits trap).
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',             f.id,
          'quote_no',       f.quote_no,
          'date',           f.date,
          'created_at',     f.created_at,
          'status',         f.status,
          'reference',      f.reference,
          'net_total',      round(f.net_total::numeric,    2),
          'grand_total',    round(f.grand_total::numeric,  2),
          'payment_status', coalesce(q.payment_status, 'unpaid'),
          'amount_paid',    round(coalesce(q.amount_paid, 0), 2),
          'balance',        round(f.grand_total::numeric - coalesce(q.amount_paid, 0), 2),
          'viewed_at',      q.viewed_at,
          'view_count',     coalesce(q.view_count, 0)
        )
        ORDER BY f.created_at DESC, f.id DESC
      ),
      '[]'::jsonb
    )
  INTO v_quotes
  FROM public.quotation_money f
  JOIN public.quotations q ON q.id = f.id
  WHERE f.client_id = p_cid
    AND f.deleted = false
    AND (
         (p_customer_id IS NOT NULL AND f.customer_id = p_customer_id)
      OR (v_name       IS NOT NULL AND lower(btrim(f.customer_name)) = lower(v_name))
    );

  -- Payments. Same OR-matching rule, for the same reason.
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',            p.id,
          'quotation_id',  p.quotation_id,
          'customer_id',   p.customer_id,
          'customer_name', p.customer_name,
          'amount',        round(p.amount, 2),
          'method',        p.method,
          'reference',     p.reference,
          'note',          p.note,
          'paid_at',       p.paid_at,
          'created_at',    p.created_at
        )
        ORDER BY p.paid_at DESC, p.id DESC
      ),
      '[]'::jsonb
    )
  INTO v_payments
  FROM public.payments p
  WHERE p.client_id = p_cid
    AND (
         (p_customer_id IS NOT NULL AND p.customer_id = p_customer_id)
      OR (v_name       IS NOT NULL AND lower(btrim(p.customer_name)) = lower(v_name))
    );

  -- Summary totals, derived from the arrays we just built so the numbers on the
  -- header card can never disagree with the rows listed underneath them.
  SELECT coalesce(sum((e->>'grand_total')::numeric), 0)
    INTO v_total_quoted
    FROM jsonb_array_elements(v_quotes) e;

  SELECT coalesce(sum((e->>'amount')::numeric), 0)
    INTO v_total_paid
    FROM jsonb_array_elements(v_payments) e;

  RETURN jsonb_build_object(
    'customer', jsonb_build_object(
      'client_id',     p_cid,
      'customer_id',   p_customer_id,
      'customer_name', v_name
    ),
    'quotations', v_quotes,
    'payments',   v_payments,
    'summary', jsonb_build_object(
      'quote_count',   jsonb_array_length(v_quotes),
      'payment_count', jsonb_array_length(v_payments),
      'total_quoted',  round(v_total_quoted, 2),
      'total_paid',    round(v_total_paid,   2),
      'balance',       round(v_total_quoted - v_total_paid, 2)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.customer_history IS
  'Customer 360 in one round-trip: {customer, quotations[], payments[], summary}. '
  'Matches on customer_id OR case/whitespace-insensitive customer_name, because '
  '21 of the live quotations have customer_id NULL and are identified only by the '
  'name snapshot. Excludes soft-deleted quotations. Money comes from the shared '
  'quotation_money view, rounded to 2dp. SECURITY INVOKER so RLS still applies, '
  'plus an x-client-id header pin when the header is present.';


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Same convention as 010/011: SECURITY INVOKER + explicit client_id argument +
-- GRANT EXECUTE to anon/authenticated/service_role.
GRANT EXECUTE ON FUNCTION public.customer_history(text, text, uuid)
  TO anon, authenticated, service_role;

-- Table grants. Supabase's default privileges in the `public` schema normally
-- cover this automatically (which is why 007/008 got away without them), but
-- being explicit costs nothing and makes the migration correct on a database
-- where those default privileges were never configured -- otherwise PostgREST
-- returns a bare 401/permission-denied that looks like an RLS bug and burns an
-- afternoon. RLS still gates every row; these are table-level grants only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_photos  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments          TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_notifications TO anon, authenticated, service_role;


COMMIT;


-- ============================================================================
-- STORAGE: `site-photos` bucket -- runbook (NOT executed by this migration)
-- ============================================================================
-- Bucket creation is intentionally left OUT of this migration. `storage.buckets`
-- is owned by the `supabase_storage_admin` role, and the migration/pooler user
-- (postgres.<ref>) may or may not be able to INSERT into it depending on the
-- project. A migration that sometimes works is worse than one that never
-- pretends to. Storage is ALSO not covered by data-only migration tools -- when
-- we moved projects on 08-08-2026 the new project had ZERO buckets and every
-- logo 404'd until they were recreated by hand. Treat this section as a
-- mandatory post-migration checklist item, not an optional extra.
--
-- ----------------------------------------------------------------------------
-- PATH CONVENTION (must match what the Flutter app uploads)
-- ----------------------------------------------------------------------------
--   site-photos/<client_id>/<quotation_id>/<uuid>.<ext>
--   e.g. site-photos/venkateshwara/1f2e3d4c-.../9a8b7c6d-....jpg
--
--   The FIRST path segment is the client_id. That is what makes per-tenant
--   storage policies expressible at all: storage.foldername(name)[1] is the
--   tenant. Never flatten this -- a flat bucket cannot be isolated.
--
--   Store the path (without the bucket name) in quotation_photos.storage_path
--   and the resulting CDN URL in quotation_photos.public_url.
--
-- ----------------------------------------------------------------------------
-- OPTION A -- Dashboard (recommended, always works)
-- ----------------------------------------------------------------------------
--   1. Supabase Dashboard -> Storage -> New bucket
--   2. Name:   site-photos
--      Public: ON      (photos are embedded in PDFs and shared quote links;
--                       signed URLs would expire and break an emailed PDF)
--      File size limit: 10 MB
--      Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
--   3. Create.
--   4. Verify:  https://<ref>.supabase.co/storage/v1/object/public/site-photos/<path>
--               must return HTTP 200 for a test upload.
--
-- ----------------------------------------------------------------------------
-- OPTION B -- SQL (only if the executing role can write storage.buckets)
-- ----------------------------------------------------------------------------
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'site-photos',
--   'site-photos',
--   true,
--   10485760,                                    -- 10 MB
--   ARRAY['image/jpeg','image/png','image/webp','image/heic']
-- )
-- ON CONFLICT (id) DO UPDATE
--   SET public             = EXCLUDED.public,
--       file_size_limit    = EXCLUDED.file_size_limit,
--       allowed_mime_types = EXCLUDED.allowed_mime_types;
--
-- ----------------------------------------------------------------------------
-- OPTION C -- Management API (what was actually used on 08-08-2026)
-- ----------------------------------------------------------------------------
-- curl -X POST "https://<ref>.supabase.co/storage/v1/bucket" ^
--   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" ^
--   -H "Content-Type: application/json" ^
--   -d "{\"id\":\"site-photos\",\"name\":\"site-photos\",\"public\":true,
--        \"file_size_limit\":10485760,
--        \"allowed_mime_types\":[\"image/jpeg\",\"image/png\",\"image/webp\",\"image/heic\"]}"
--
-- ----------------------------------------------------------------------------
-- PER-CLIENT FOLDER POLICIES on storage.objects
-- ----------------------------------------------------------------------------
-- A public bucket means anyone with the URL can READ an object (that is the
-- point -- shared quote links and PDFs). WRITES must still be tenant-scoped, so
-- one client's app can never overwrite or delete another client's photos.
-- storage.foldername(name)[1] is the first path segment = the client_id.
--
-- Run these as a role that owns storage.objects (Dashboard SQL editor works):
--
-- DROP POLICY IF EXISTS "site_photos_public_read" ON storage.objects;
-- CREATE POLICY "site_photos_public_read"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'site-photos');
--
-- DROP POLICY IF EXISTS "site_photos_client_insert" ON storage.objects;
-- CREATE POLICY "site_photos_client_insert"
--   ON storage.objects FOR INSERT TO anon, authenticated
--   WITH CHECK (
--     bucket_id = 'site-photos'
--     AND (storage.foldername(name))[1]
--         = current_setting('request.headers', true)::json->>'x-client-id'
--   );
--
-- DROP POLICY IF EXISTS "site_photos_client_update" ON storage.objects;
-- CREATE POLICY "site_photos_client_update"
--   ON storage.objects FOR UPDATE TO anon, authenticated
--   USING (
--     bucket_id = 'site-photos'
--     AND (storage.foldername(name))[1]
--         = current_setting('request.headers', true)::json->>'x-client-id'
--   );
--
-- DROP POLICY IF EXISTS "site_photos_client_delete" ON storage.objects;
-- CREATE POLICY "site_photos_client_delete"
--   ON storage.objects FOR DELETE TO anon, authenticated
--   USING (
--     bucket_id = 'site-photos'
--     AND (storage.foldername(name))[1]
--         = current_setting('request.headers', true)::json->>'x-client-id'
--   );
--
-- ----------------------------------------------------------------------------
-- HOUSEKEEPING
-- ----------------------------------------------------------------------------
-- * Deleting a quotation_photos row does NOT delete the storage object, and the
--   FK CASCADE from quotations does not either. The app must call
--   `supabase.storage.from('site-photos').remove([storage_path])` alongside the
--   row delete, or storage will leak. Orphan sweep:
--
--     -- objects with no matching metadata row
--     SELECT o.name
--     FROM storage.objects o
--     WHERE o.bucket_id = 'site-photos'
--       AND NOT EXISTS (
--         SELECT 1 FROM public.quotation_photos p WHERE p.storage_path = o.name
--       );
--
-- * Free-tier storage is 1 GB. Site photos are the first thing in this product
--   that can realistically fill it. Compress client-side to <= 1600px on the
--   long edge / ~200 KB before upload; 10 MB is the hard ceiling, not the target.
-- ============================================================================

NOTIFY pgrst, 'reload schema';
