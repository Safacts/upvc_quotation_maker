-- ============================================================================
-- Migration 016 - create_tenant RPC for atomic, idempotent onboarding
-- ============================================================================
-- Purpose:
--   Adding a new client currently requires manually inserting into `clients`
--   and `quotation_counters`. That is easy to get wrong (missing counter row
--   means get_next_quote_number misbehaves for the new tenant).
--   This RPC encapsulates the whole onboarding write in ONE atomic call.
--
-- Behaviour:
--   create_tenant(p_client_id text, p_config jsonb DEFAULT '{}') RETURNS void
--     1. Validates p_client_id is non-null and non-blank (RAISE EXCEPTION).
--     2. INSERT INTO clients ... ON CONFLICT (id) DO NOTHING   (idempotent)
--     3. INSERT INTO quotation_counters ... ON CONFLICT DO NOTHING (idempotent)
--
-- Counter column - VERIFIED LIVE 09-08-2026 on BOTH prod and staging:
--   public.quotation_counters is (client_id text PK, next_val bigint NOT NULL).
--   There is NO `current_value` column - the ticket spec was wrong.
--   Seed value MUST be 0, not 1: get_next_quote_number(cid) does
--     INSERT (cid, 1) ON CONFLICT DO UPDATE SET next_val = next_val + 1 RETURNING next_val
--   so a pre-seeded row of 0 makes the first issued number 0001. Seeding 1 would
--   silently burn quote number 0001 for every new tenant.
--
-- Security model:
--   SECURITY INVOKER - runs with the caller's privileges, consistent with
--   search_quotations / get_quote_stats (migration 011). `clients` RLS only
--   permits service_role + the admin policy, so the signup API MUST call this
--   with the service_role key. A SECURITY DEFINER function here would let any
--   anon caller create tenant rows, which is not acceptable.
--
-- Notes:
--   - Does NOT touch clients.tier / tier_activated_at / payment_ref /
--     activated_by - migration 014 is authored but NOT applied.
--   - ASCII-ONLY, NO BOM (009/010/011 shipped with a UTF-8 BOM and threw
--     `syntax error at or near ""` until the apply script stripped it).
--   - TAKE A BACKUP FIRST: scripts\run_backup.bat
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant(
  p_client_id text,
  p_config jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Validate input
  IF p_client_id IS NULL OR length(trim(p_client_id)) = 0 THEN
    RAISE EXCEPTION 'p_client_id must be a non-empty text value';
  END IF;

  -- 1. Insert tenant row (idempotent)
  INSERT INTO public.clients (id, config, is_active, created_at)
  VALUES (p_client_id, coalesce(p_config, '{}'::jsonb), true, now())
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed quotation counter (idempotent). Column is next_val (bigint), seeded to 0
  --    so that the first get_next_quote_number() call returns ...-0001.
  INSERT INTO public.quotation_counters (client_id, next_val)
  VALUES (p_client_id, 0)
  ON CONFLICT (client_id) DO NOTHING;

  RETURN;
END;
$$;

-- Signup API uses the service_role key; anon/authenticated are granted EXECUTE
-- but are still blocked by RLS on clients (defence in depth stays at the RLS layer).
GRANT EXECUTE ON FUNCTION public.create_tenant(text, jsonb)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_tenant(text, jsonb) IS
  'Atomic, idempotent tenant onboarding: inserts clients row + seeds quotation_counters. '
  'Idempotent (ON CONFLICT DO NOTHING) so re-calls are safe. SECURITY INVOKER - must be '
  'called with service_role key to bypass clients RLS.';

COMMIT;

NOTIFY pgrst, 'reload schema';
