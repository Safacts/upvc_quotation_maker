-- ============================================================================
-- Migration 023 -- Quotation State Machine & Lifecycle Tracking
-- ============================================================================
--
-- SCOPE
--   Adds lifecycle timestamps and valid_until to quotations for tracking
--   the complete quote lifecycle: draft -> sent -> viewed -> accepted/rejected/expired.
--   Also adds a CHECK constraint to enforce valid status values.
--
-- PREREQUISITES
--   schema.sql              (quotations table exists with status TEXT DEFAULT 'draft')
--   009_masters.sql         (status already normalized to lowercase)
--   012_mobile_features.sql (viewed_at already added)
--   011_phase2_reports_and_export.sql (deleted boolean already added)
--
-- DESIGN DECISIONS
--   - quotations.status already exists (DEFAULT 'draft') from schema.sql.
--     We add a CHECK constraint to enforce valid values, NOT a new column.
--   - quotations.viewed_at already exists from 012_mobile_features.sql.
--     We skip adding it again.
--   - valid_until: date (not timestamptz) because quotation validity is
--     day-granularity, not second-granularity. Client terms say "valid for 15 days".
--   - sent_at, accepted_at, rejected_at, expired_at are timestamptz for
--     precise lifecycle tracking and analytics.
--   - Status transitions are enforced by CHECK constraint, not trigger:
--     (a) simpler, (b) no function dependency, (c) adequate for our needs.
--     Complex transition rules (e.g., can't go from rejected to accepted)
--     belong in the app layer.
--
-- VALID STATES
--   draft    -- initial state, quote being prepared
--   sent     -- quote sent to customer (email/link shared)
--   viewed   -- customer opened the public quote link
--   accepted -- customer approved the quote
--   rejected -- customer declined the quote
--   expired  -- quote passed valid_until date
--   cancelled -- admin cancelled the quote
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. Add lifecycle columns (ADDITIVE, safe defaults)
-- ---------------------------------------------------------------------------
-- All columns are NULLABLE with no DEFAULT: existing rows get NULL, which
-- means "this event has not happened yet". No backfill needed.

-- valid_until: when the quote expires (date, not timestamptz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotations'
      AND column_name  = 'valid_until'
  ) THEN
    ALTER TABLE public.quotations
      ADD COLUMN valid_until date;
  END IF;
END $$;

-- sent_at: when the quote was sent to the customer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotations'
      AND column_name  = 'sent_at'
  ) THEN
    ALTER TABLE public.quotations
      ADD COLUMN sent_at timestamptz;
  END IF;
END $$;

-- accepted_at: when the customer accepted the quote
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotations'
      AND column_name  = 'accepted_at'
  ) THEN
    ALTER TABLE public.quotations
      ADD COLUMN accepted_at timestamptz;
  END IF;
END $$;

-- rejected_at: when the customer rejected the quote
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotations'
      AND column_name  = 'rejected_at'
  ) THEN
    ALTER TABLE public.quotations
      ADD COLUMN rejected_at timestamptz;
  END IF;
END $$;

-- expired_at: when the quote was marked as expired (admin action or cron)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotations'
      AND column_name  = 'expired_at'
  ) THEN
    ALTER TABLE public.quotations
      ADD COLUMN expired_at timestamptz;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. CHECK constraint: valid status values
-- ---------------------------------------------------------------------------
-- Enforces that only recognized status values are stored. This prevents
-- typos and inconsistent state from reaching the database.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'quotations_status_values_chk'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_status_values_chk
      CHECK (status IN (
        'draft', 'sent', 'viewed', 'accepted',
        'rejected', 'expired', 'cancelled'
      ));
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Indexes for lifecycle queries
-- ---------------------------------------------------------------------------
-- "Quotes expiring soon" -- batch job to mark expired
CREATE INDEX IF NOT EXISTS quotations_valid_until_idx
  ON public.quotations (valid_until)
  WHERE valid_until IS NOT NULL
    AND status NOT IN ('accepted', 'rejected', 'cancelled', 'expired')
    AND deleted = false;

-- "Quotes by status" -- dashboard filter
CREATE INDEX IF NOT EXISTS quotations_client_status_idx
  ON public.quotations (client_id, status)
  WHERE deleted = false;

-- "Recently sent quotes" -- follow-up dashboard
CREATE INDEX IF NOT EXISTS quotations_sent_at_idx
  ON public.quotations (sent_at DESC)
  WHERE sent_at IS NOT NULL
    AND status NOT IN ('accepted', 'rejected', 'cancelled', 'expired')
    AND deleted = false;


-- ---------------------------------------------------------------------------
-- 4. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.quotations.valid_until IS
  'Date when the quotation expires. Quotation is valid until end of this day. '
  'NULL = no expiration (permanent quote). Terms typically say 15 days.';

COMMENT ON COLUMN public.quotations.sent_at IS
  'Timestamp when the quote was sent/shared with the customer (email or link). '
  'NULL = not yet sent (still in draft).';

COMMENT ON COLUMN public.quotations.accepted_at IS
  'Timestamp when the customer accepted/approved the quote. '
  'NULL = not yet accepted. Only set when status = accepted.';

COMMENT ON COLUMN public.quotations.rejected_at IS
  'Timestamp when the customer rejected/declined the quote. '
  'NULL = not yet rejected. Only set when status = rejected.';

COMMENT ON COLUMN public.quotations.expired_at IS
  'Timestamp when the quote was marked as expired (admin action or cron job). '
  'NULL = not expired. Only set when status = expired.';


COMMIT;

NOTIFY pgrst, 'reload schema';
