-- ============================================================================
-- Migration 034 -- Quotation State Machine v2
-- ============================================================================
-- Canonical lifecycle:
-- draft -> sent -> viewed -> approved -> in_production -> dispatched
--        -> installed -> invoiced -> paid
-- Rejection is a terminal branch from sent or viewed.
--
-- This migration is additive and idempotent. It is intentionally NOT applied
-- here; apply it only to the staging Supabase project after a backup.
-- ============================================================================

BEGIN;

-- Remove the old seven-state constraint before normalizing aliases. The old
-- constraint would reject the canonical value approved during this update.
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_status_values_chk;

-- The old schema used accepted/won/lost. Normalize those aliases before the
-- new strict constraint is installed. Expired/cancelled remain readable
-- legacy terminal states and are deliberately not allowed in new transitions.
UPDATE public.quotations SET status = 'approved' WHERE lower(status) IN ('accepted', 'won');
UPDATE public.quotations SET status = 'rejected' WHERE lower(status) = 'lost';
UPDATE public.quotations SET status = lower(status) WHERE status IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='sent_at') THEN
    ALTER TABLE public.quotations ADD COLUMN sent_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='viewed_at') THEN
    ALTER TABLE public.quotations ADD COLUMN viewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='rejected_at') THEN
    ALTER TABLE public.quotations ADD COLUMN rejected_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='approved_at') THEN
    ALTER TABLE public.quotations ADD COLUMN approved_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='in_production_at') THEN
    ALTER TABLE public.quotations ADD COLUMN in_production_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='dispatched_at') THEN
    ALTER TABLE public.quotations ADD COLUMN dispatched_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='installed_at') THEN
    ALTER TABLE public.quotations ADD COLUMN installed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='invoiced_at') THEN
    ALTER TABLE public.quotations ADD COLUMN invoiced_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='paid_at') THEN
    ALTER TABLE public.quotations ADD COLUMN paid_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='state_changed_at') THEN
    ALTER TABLE public.quotations ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_values_v2_chk CHECK (status IN (
    'draft', 'sent', 'viewed', 'approved', 'rejected',
    'in_production', 'dispatched', 'installed', 'invoiced', 'paid',
    'expired', 'cancelled'
  ));

CREATE INDEX IF NOT EXISTS quotations_client_status_v2_idx
  ON public.quotations (client_id, status, state_changed_at DESC)
  WHERE deleted = false;

COMMENT ON COLUMN public.quotations.status IS
  'Canonical quotation lifecycle: draft, sent, viewed, approved, rejected, in_production, dispatched, installed, invoiced, paid. expired/cancelled are legacy read-only states.';

CREATE OR REPLACE FUNCTION public.validate_quotation_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'sent') OR
      (OLD.status = 'sent' AND NEW.status IN ('viewed', 'rejected')) OR
      (OLD.status = 'viewed' AND NEW.status IN ('approved', 'rejected')) OR
      (OLD.status = 'approved' AND NEW.status = 'in_production') OR
      (OLD.status = 'in_production' AND NEW.status = 'dispatched') OR
      (OLD.status = 'dispatched' AND NEW.status = 'installed') OR
      (OLD.status = 'installed' AND NEW.status = 'invoiced') OR
      (OLD.status = 'invoiced' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Invalid quotation state transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.state_changed_at := now();
  END IF;

  IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN NEW.sent_at := now(); END IF;
  IF NEW.status = 'viewed' AND NEW.viewed_at IS NULL THEN NEW.viewed_at := now(); END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'rejected' AND NEW.rejected_at IS NULL THEN NEW.rejected_at := now(); END IF;
  IF NEW.status = 'in_production' AND NEW.in_production_at IS NULL THEN NEW.in_production_at := now(); END IF;
  IF NEW.status = 'dispatched' AND NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
  IF NEW.status = 'installed' AND NEW.installed_at IS NULL THEN NEW.installed_at := now(); END IF;
  IF NEW.status = 'invoiced' AND NEW.invoiced_at IS NULL THEN NEW.invoiced_at := now(); END IF;
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_state_transition_trigger ON public.quotations;
CREATE TRIGGER quotations_state_transition_trigger
  BEFORE UPDATE OF status ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_state_transition();

CREATE OR REPLACE FUNCTION public.advance_quotation_state(
  p_client_id text,
  p_quotation_id uuid,
  p_new_state text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_client text;
  v_row public.quotations;
BEGIN
  v_header_client := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_client IS NOT NULL AND v_header_client <> p_client_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'client header mismatch');
  END IF;

  UPDATE public.quotations
  SET status = lower(trim(p_new_state))
  WHERE id = p_quotation_id AND client_id = p_client_id AND deleted = false
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'quotation not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'quotation', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_quotation_state(text, uuid, text)
  TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
