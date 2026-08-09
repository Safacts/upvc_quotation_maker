-- ============================================================================
-- Migration 014 -- Pricing tiers: clients.tier + activation audit trail
-- ============================================================================
--
-- SCOPE
--   Backing schema for SERVER-SIDE FEATURE GATING (src/lib/tiers.ts). Until
--   now the product had ZERO feature-gating: every client that logged in saw
--   every feature, so a Rs.10,000 client could use a Rs.55,000 feature. This
--   migration adds the column the gate reads, plus the audit trail that records
--   WHO activated WHICH tier against WHICH payment.
--
-- WHAT'S NEW
--   1. clients.tier               -- the gate's source of truth
--   2. clients.tier_activated_at  -- when the current tier took effect
--   3. clients.payment_ref        -- the payment that bought it (audit)
--   4. clients.activated_by       -- which admin pressed the button (audit)
--   5. tier_activations           -- append-only history of every tier change
--
-- THE TIER LADDER (ascending; the string values are load-bearing --
-- src/lib/tiers.ts TIERS[] must stay byte-identical to this CHECK list)
--   low       Rs.10,000  Offline app + whitelabeling only. No data responsibility.
--   base      Rs.25,000  Android app + web dashboard + cloud + invoicing
--   next      Rs.35,000  + webpage + SEO + dynamic reviews + email notifications
--   nextplus  Rs.45,000  + business optimization + WhatsApp sharing
--   final     Rs.55,000  + web console + payment tracking + auto payment status
--
-- ############################################################################
-- #  GRANDFATHERING -- READ BEFORE CHANGING THE BACKFILL                     #
-- ############################################################################
-- Aadi's explicit instruction (09-08-2026): "venkateshwara and kpr will be
-- having full access as they are our first ones ... dont lock them out."
--
-- So EVERY pre-existing client is backfilled to 'final'. This is deliberate and
-- it is the safe direction:
--   * Venkateshwara is a paying client ALREADY USING the desktop console and
--     GST invoicing. Backfilling them to 'base' would REVOKE features they use
--     daily -- an over-gate, which Bugsy correctly ranks as CRITICAL (trust
--     destroyed, refund demand) and which is far worse than a revenue leak from
--     two known accounts.
--   * KPR is our first trial client and is grandfathered by promise.
--   * The other four rows are test/demo tenants ('testy', '123456789',
--     'new-client-123', 'akshaya upvc') with no real users; granting them
--     'final' leaks nothing because nobody logs into them.
--
-- The gate FAILS CLOSED for everything created AFTER this migration: the column
-- is deliberately NULLABLE with NO DEFAULT, so a brand-new client has tier NULL
-- and src/lib/tiers.ts grants them NOTHING until a tier is explicitly sold and
-- activated. NULL means "not yet sold", never "everything".
--
-- Do NOT add `DEFAULT 'final'`. That single word would silently give every
-- future signup the entire Rs.55,000 product.
-- ############################################################################
--
-- PREREQUISITES
--   schema_clients.sql (public.clients)
--
-- ASCII-ONLY, NO BOM -- 009/010/011 shipped with a UTF-8 BOM and em-dashes and
-- produced `syntax error at or near ""` until the BOM was stripped.
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
-- 1. clients.tier + activation metadata
-- ---------------------------------------------------------------------------
-- All ADD COLUMN IF NOT EXISTS and all NULLABLE, so this is an instant
-- metadata-only change on the live table and cannot break an older APK doing a
-- SELECT *.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tier text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tier_activated_at timestamptz;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_ref text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS activated_by text;


-- ---------------------------------------------------------------------------
-- 2. Backfill EXISTING clients to 'final' (see the grandfathering box above)
-- ---------------------------------------------------------------------------
-- `WHERE tier IS NULL` makes this re-runnable AND makes it a one-shot: once a
-- real tier has been sold and set, re-running 014 will never overwrite it back
-- up to 'final'.
UPDATE public.clients
   SET tier              = 'final',
       tier_activated_at = COALESCE(tier_activated_at, now()),
       activated_by      = COALESCE(activated_by, 'migration_014_grandfathered')
 WHERE tier IS NULL;


-- ---------------------------------------------------------------------------
-- 3. Value guard
-- ---------------------------------------------------------------------------
-- Added AFTER the backfill so it validates against already-clean data.
--
-- NULL is explicitly ALLOWED by this CHECK -- that is the "not yet sold" state
-- for a new signup, and the application gate denies everything for it. What the
-- CHECK forbids is a MISSPELLED tier ('Final', 'next+', 'premium'), because
-- src/lib/tiers.ts resolves an unrecognised string to null = access denied.
-- Without this constraint a stray capital letter in the admin UI would lock a
-- paying client out of everything they bought, and the cause would be invisible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'clients_tier_chk'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tier_chk
      CHECK (tier IS NULL OR tier IN ('low', 'base', 'next', 'nextplus', 'final'));
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. tier_activations -- append-only audit trail
-- ---------------------------------------------------------------------------
-- Money changed hands. There must be a permanent record of who granted what,
-- when, and against which payment -- separate from clients.tier, which only
-- ever shows the CURRENT state and is overwritten on every upgrade.
--
-- No FK to clients ON DELETE CASCADE: deleting a client must never destroy the
-- record that they once paid us. Same reasoning as payments in migration 012.
CREATE TABLE IF NOT EXISTS public.tier_activations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      text NOT NULL,
  from_tier      text,
  to_tier        text NOT NULL,
  payment_ref    text NOT NULL DEFAULT '',
  amount         numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  activated_by   text NOT NULL DEFAULT '',
  note           text NOT NULL DEFAULT '',

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- "This client's tier history, newest first" -- the billing screen.
CREATE INDEX IF NOT EXISTS tier_activations_client_created_idx
  ON public.tier_activations (client_id, created_at DESC);

-- One payment reference must not activate two accounts. Partial UNIQUE index so
-- the many rows with an empty payment_ref (comps, grandfathering, downgrades)
-- do not collide with each other -- only real references are deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS tier_activations_payment_ref_uniq
  ON public.tier_activations (payment_ref)
  WHERE payment_ref <> '';

ALTER TABLE public.tier_activations ENABLE ROW LEVEL SECURITY;

-- NOTE: deliberately NO "Allow public all" policy here, unlike 012's tables.
-- This is billing data. The anon-key Flutter app has no business reading it;
-- only the service-role Next.js API touches it.
DROP POLICY IF EXISTS "Allow service_role full access on tier_activations" ON public.tier_activations;
CREATE POLICY "Allow service_role full access on tier_activations"
    ON public.tier_activations
    USING (auth.role() = 'service_role');

GRANT SELECT, INSERT ON public.tier_activations TO service_role;

-- Seed the audit trail with the grandfathering event, so the history explains
-- why these accounts are on 'final' without anyone having paid Rs.55,000.
INSERT INTO public.tier_activations (client_id, from_tier, to_tier, payment_ref, activated_by, note)
SELECT c.id,
       NULL,
       'final',
       '',
       'migration_014_grandfathered',
       'Grandfathered by migration 014 (Aadi 09-08-2026): pre-existing clients '
       'keep full access. Venkateshwara + KPR are our first clients and were '
       'promised full access permanently.'
  FROM public.clients c
 WHERE NOT EXISTS (
         SELECT 1 FROM public.tier_activations t WHERE t.client_id = c.id
       );


-- ---------------------------------------------------------------------------
-- 5. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.clients.tier IS
  'Pricing tier gating server-side feature access: low|base|next|nextplus|final. '
  'NULL = not yet sold; src/lib/tiers.ts FAILS CLOSED and grants nothing. Never '
  'give this column a DEFAULT -- that would hand every new signup the full product.';
COMMENT ON COLUMN public.clients.tier_activated_at IS
  'When the CURRENT tier took effect. History lives in tier_activations.';
COMMENT ON COLUMN public.clients.payment_ref IS
  'Payment reference that bought the current tier, e.g. UPI/2026/08/09/ABC123.';
COMMENT ON COLUMN public.clients.activated_by IS
  'Admin email that activated the current tier (or migration_014_grandfathered).';
COMMENT ON TABLE public.tier_activations IS
  'Append-only audit trail of every tier change. Never cascades from clients -- '
  'the record that someone paid us must outlive the account. payment_ref is '
  'UNIQUE when non-empty so one payment cannot activate two accounts.';


COMMIT;

NOTIFY pgrst, 'reload schema';
