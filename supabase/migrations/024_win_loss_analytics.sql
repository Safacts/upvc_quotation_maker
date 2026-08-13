-- ============================================================================
-- Migration 024 -- Win/Loss Analytics RPC
-- ============================================================================
--
-- SCOPE
--   Creates the get_win_loss_analytics() RPC function that provides
--   comprehensive quotation analytics: win rate, average quote value,
--   average time to close, and breakdown by status.
--
-- PREREQUISITES
--   008_products.sql         (products table)
--   023_quotation_state_machine.sql (quotations has status, sent_at, accepted_at)
--   012_mobile_features.sql (quotations has amount_paid)
--
-- DESIGN DECISIONS
--   - SECURITY INVOKER: caller must have SELECT on quotations, enforced by RLS.
--   - Date range is optional: NULL means "all time".
--   - Returns jsonb for flexible consumption by Flutter app and Next.js API.
--   - avg_time_to_close: computed as average days between sent_at and
--     accepted_at (for won) or rejected_at/expired_at (for lost).
--   - Win rate = won / (won + lost) * 100. Pending/expired/excluded from rate.
--   - avg_quote_value: average total_amount of all quotes in the period.
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run (CREATE OR REPLACE).
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. get_win_loss_analytics() -- comprehensive quotation analytics
-- ---------------------------------------------------------------------------
-- Parameters:
--   p_client_id  -- tenant (required)
--   p_from       -- start date filter (inclusive, NULL = all time)
--   p_to         -- end date filter (inclusive, NULL = today)
--
-- Returns: jsonb with:
--   total_quotes    -- total quotations in period
--   won             -- accepted quotations
--   lost            -- rejected quotations
--   pending         -- draft/sent/viewed (not yet decided)
--   expired         -- expired quotations
--   cancelled       -- cancelled quotations
--   win_rate        -- won / (won + lost) * 100, or 0 if no decisions
--   avg_quote_value -- average total_amount of all quotes
--   avg_time_to_close_days -- average days from sent to decision (won+lost)
--   period_from     -- actual start date used
--   period_to       -- actual end date used

CREATE OR REPLACE FUNCTION public.get_win_loss_analytics(
  p_client_id text,
  p_from      date DEFAULT NULL,
  p_to        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_cid   text;
  v_from         date;
  v_to           date;
  v_result       jsonb;
  v_total        int;
  v_won          int;
  v_lost         int;
  v_pending      int;
  v_expired      int;
  v_cancelled    int;
  v_win_rate     numeric;
  v_avg_value    numeric;
  v_avg_days     numeric;
BEGIN
  -- Header guard (belt-and-braces with RLS)
  v_header_cid := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_cid IS NOT NULL AND v_header_cid <> p_client_id THEN
    RAISE EXCEPTION 'p_client_id does not match x-client-id header';
  END IF;

  -- Default date range
  v_from := COALESCE(p_from, '2020-01-01'::date);
  v_to   := COALESCE(p_to, CURRENT_DATE);

  -- Validate date range
  IF v_to < v_from THEN
    RAISE EXCEPTION 'p_to must be >= p_from';
  END IF;

  -- Count by status (non-deleted quotes in date range)
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'accepted')::int,
    COUNT(*) FILTER (WHERE status = 'rejected')::int,
    COUNT(*) FILTER (WHERE status IN ('draft', 'sent', 'viewed'))::int,
    COUNT(*) FILTER (WHERE status = 'expired')::int,
    COUNT(*) FILTER (WHERE status = 'cancelled')::int
  INTO v_total, v_won, v_lost, v_pending, v_expired, v_cancelled
  FROM public.quotations
  WHERE client_id = p_client_id
    AND deleted = false
    AND created_at::date >= v_from
    AND created_at::date <= v_to;

  -- Win rate: won / (won + lost) * 100
  -- Returns 0 if no decisions yet (avoids division by zero)
  IF (v_won + v_lost) > 0 THEN
    v_win_rate := ROUND((v_won::numeric / (v_won + v_lost)) * 100, 1);
  ELSE
    v_win_rate := 0;
  END IF;

  -- Average quote value (all quotes in period)
  SELECT COALESCE(AVG(
    COALESCE(
      (SELECT SUM(mi.width * mi.height * mi.units * mi.rate)
       FROM public.measured_items mi WHERE mi.quotation_id = q.id),
      0
    ) + COALESCE(
      (SELECT SUM(um.units * um.rate)
       FROM public.unmeasured_items um WHERE um.quotation_id = q.id),
      0
    ) + q.transport_cost
  ), 0)
  INTO v_avg_value
  FROM public.quotations q
  WHERE q.client_id = p_client_id
    AND q.deleted = false
    AND q.created_at::date >= v_from
    AND q.created_at::date <= v_to;

  -- Average time to close (days from sent_at to decision)
  -- Only for won + lost quotes that have both sent_at and a decision timestamp
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (
      COALESCE(q.accepted_at, q.rejected_at, q.expired_at) - q.sent_at
    )) / 86400.0
  ), 0)
  INTO v_avg_days
  FROM public.quotations q
  WHERE q.client_id = p_client_id
    AND q.deleted = false
    AND q.created_at::date >= v_from
    AND q.created_at::date <= v_to
    AND q.status IN ('accepted', 'rejected', 'expired')
    AND q.sent_at IS NOT NULL
    AND COALESCE(q.accepted_at, q.rejected_at, q.expired_at) IS NOT NULL;

  -- Build result jsonb
  v_result := json_build_object(
    'total_quotes',            v_total,
    'won',                     v_won,
    'lost',                    v_lost,
    'pending',                 v_pending,
    'expired',                 v_expired,
    'cancelled',               v_cancelled,
    'win_rate',                v_win_rate,
    'avg_quote_value',         ROUND(v_avg_value, 2),
    'avg_time_to_close_days',  ROUND(COALESCE(v_avg_days, 0), 1),
    'period_from',             v_from,
    'period_to',               v_to
  );

  RETURN v_result;
END;
$$;


-- Grant execute to all roles (anon, authenticated, service_role)
GRANT EXECUTE ON FUNCTION public.get_win_loss_analytics(text, date, date)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.get_win_loss_analytics(text, date, date) IS
  'Comprehensive quotation win/loss analytics. Returns breakdown by status, '
  'win rate (accepted / (accepted + rejected)), average quote value, and '
  'average time to close in days. Date range is optional (NULL = all time). '
  'Excludes soft-deleted quotes.';


COMMIT;

NOTIFY pgrst, 'reload schema';
