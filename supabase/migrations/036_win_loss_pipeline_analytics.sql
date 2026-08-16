-- Migration 036 -- Win/Loss pipeline analytics
-- Additive and idempotent. Apply to staging first; this file is not executed here.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_win_loss_pipeline(
  p_client_id text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_client text;
  v_from date := COALESCE(p_from, '1900-01-01'::date);
  v_to date := COALESCE(p_to, CURRENT_DATE);
  v_result jsonb;
BEGIN
  v_header_client := nullif(current_setting('request.headers', true), '')::json->>'x-client-id';
  IF v_header_client IS NOT NULL AND v_header_client <> p_client_id THEN
    RAISE EXCEPTION 'p_client_id does not match x-client-id header';
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'p_to must be >= p_from';
  END IF;

  WITH quote_values AS (
    SELECT q.status,
      COALESCE((SELECT SUM(mi.width * mi.height * mi.units * mi.rate)
        FROM public.measured_items mi WHERE mi.quotation_id = q.id), 0)
      + COALESCE((SELECT SUM(ui.units * ui.rate)
        FROM public.unmeasured_items ui WHERE ui.quotation_id = q.id), 0)
      + COALESCE(q.transport_cost, 0) AS quote_value
    FROM public.quotations q
    WHERE q.client_id = p_client_id
      AND COALESCE(q.deleted, false) = false
      AND q.created_at::date BETWEEN v_from AND v_to
  ), normalized AS (
    SELECT CASE lower(trim(COALESCE(status, 'draft')))
      WHEN 'accepted' THEN 'approved'
      WHEN 'won' THEN 'approved'
      WHEN 'lost' THEN 'rejected'
      ELSE lower(trim(COALESCE(status, 'draft')))
    END AS state, quote_value
    FROM quote_values
  ), grouped AS (
    SELECT state, COUNT(*)::int AS quote_count,
      ROUND(COALESCE(SUM(quote_value), 0), 2) AS total_value,
      ROUND(COALESCE(AVG(quote_value), 0), 2) AS average_value
    FROM normalized
    GROUP BY state
  ), summary AS (
    SELECT COUNT(*)::int AS total_quotes,
      COUNT(*) FILTER (WHERE state = 'approved')::int AS won_quotes,
      COUNT(*) FILTER (WHERE state = 'rejected')::int AS lost_quotes,
      COUNT(*) FILTER (WHERE state IN ('draft','sent','viewed'))::int AS open_quotes,
      ROUND(COALESCE(SUM(quote_value), 0), 2) AS pipeline_value
    FROM normalized
  )
  SELECT jsonb_build_object(
    'period_from', v_from,
    'period_to', v_to,
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'states', COALESCE((SELECT jsonb_agg(to_jsonb(grouped) ORDER BY
      CASE state WHEN 'draft' THEN 1 WHEN 'sent' THEN 2 WHEN 'viewed' THEN 3
        WHEN 'approved' THEN 4 WHEN 'rejected' THEN 5 ELSE 6 END)
      FROM grouped), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_win_loss_pipeline(text, date, date)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_win_loss_pipeline(text, date, date) IS
  'Tenant-scoped quotation pipeline grouped by canonical lifecycle state; excludes soft-deleted quotes.';

COMMIT;

NOTIFY pgrst, 'reload schema';
