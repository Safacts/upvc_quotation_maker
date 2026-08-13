-- ============================================================================
-- Migration 019 -- Console RPC hardening: p_cid header guard + row caps
-- ============================================================================
--
-- SCOPE
--   Two categories of fix, applied by re-creating all 8 console RPCs:
--
--   1. p_cid <-> x-client-id header validation (belt-and-braces)
--      Every RPC now verifies that the p_cid argument matches the x-client-id
--      HTTP header when one is present. This prevents a compromised or buggy
--      client from passing a different p_cid than the header it authenticated
--      with. The check is a no-op when no header is present (service-role calls
--      from the Next.js API layer send no header).
--
--   2. Row caps on unbounded exports
--      tally_export_data() -- LIMIT 2000 (Tally XML export, one row per voucher)
--      product_movement()  -- LIMIT 1000 per SELECT in the UNION ALL
--
-- PREREQUISITES
--   010_console_rpcs.sql + 011_phase2_reports_and_export.sql
--   (both applied and verified on prod + staging as of 09-08-2026)
--
-- CHANGES FROM 011
--   - search_quotations:    plpgsql -- add header guard at top of BEGIN
--   - get_quote_stats:      sql -> plpgsql -- add header guard
--   - product_movement:     sql -> plpgsql -- add header guard + LIMIT 1000
--   - win_loss_report:      sql -> plpgsql -- add header guard
--   - gst_summary:          sql -> plpgsql -- add header guard
--   - tally_export_data:    sql -> plpgsql -- add header guard + LIMIT 2000
--   - bulk_status_update:   plpgsql -- add header guard at top of BEGIN
--   - bulk_delete:          plpgsql -- add header guard at top of BEGIN
--
-- SECURITY MODEL (unchanged)
--   SECURITY INVOKER + GRANT EXECUTE to anon/authenticated/service_role.
--   Tenant isolation is the service-role client_id filter in the API layer.
--   The header guard is defense-in-depth for anon-key callers.
--
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST:  scripts\run_backup.bat
-- ============================================================================

BEGIN;


-- ============================================================================
-- HEADER GUARD -- reusable snippet (commented for documentation, inlined)
-- ============================================================================
-- The following block is added at the top of every function's BEGIN:
--
--   IF current_setting('request.headers', true) IS NOT NULL
--      AND current_setting('request.headers', true) != '' THEN
--     IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
--       RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
--     END IF;
--   END IF;
--
-- current_setting(..., true) returns NULL outside PostgREST (e.g. psql),
-- so the guard is a no-op when there is no header. It also returns ''
-- for some configurations, hence the != '' check.


-- ============================================================================
-- 1. search_quotations -- paged/sorted/filtered quotation search
-- ============================================================================
-- Same as 011 version with one addition: p_cid header guard at top of BEGIN.

DROP FUNCTION IF EXISTS public.search_quotations(text, text, text[], timestamptz, timestamptz, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_quotations(
  p_cid          text,
  p_q            text          DEFAULT NULL,
  p_status       text[]        DEFAULT ARRAY['draft','sent','won','lost'],
  p_from         timestamptz   DEFAULT NULL,
  p_to           timestamptz   DEFAULT NULL,
  p_customer_id  uuid          DEFAULT NULL,
  p_sort         text          DEFAULT 'created_at',
  p_dir          text          DEFAULT 'desc',
  p_page         integer       DEFAULT 1,
  p_page_size    integer       DEFAULT 50
)
RETURNS TABLE (
  id             uuid,
  quote_no       text,
  customer_name  text,
  contact_no     text,
  customer_id    uuid,
  status         text,
  created_at     timestamptz,
  quote_date     date,
  reference      text,
  total_sqft     numeric,
  subtotal       numeric,
  transport      numeric,
  net_total      numeric,
  gst_percentage numeric,
  gst_amount     numeric,
  grand_total    numeric,
  total_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_page      integer := greatest(coalesce(p_page, 1), 1);
  v_size      integer := least(greatest(coalesce(p_page_size, 50), 1), 500);
  v_sort      text;
  v_dir       text;
  v_q         text;
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'search_quotations: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  v_sort := CASE lower(coalesce(p_sort, 'created_at'))
              WHEN 'created_at'    THEN 'created_at'
              WHEN 'date'          THEN 'date'
              WHEN 'quote_no'      THEN 'quote_no'
              WHEN 'customer_name' THEN 'customer_name'
              WHEN 'status'        THEN 'status'
              WHEN 'grand_total'   THEN 'grand_total'
              WHEN 'net_total'     THEN 'net_total'
              ELSE 'created_at'
            END;
  v_dir := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  v_q := nullif(btrim(coalesce(p_q, '')), '');

  RETURN QUERY EXECUTE format($f$
    SELECT
      f.id,
      f.quote_no,
      f.customer_name,
      f.contact_no,
      f.customer_id,
      f.status,
      f.created_at,
      f.date,
      f.reference,
      round(f.total_sqft::numeric,     3),
      round(f.subtotal::numeric,       2),
      round(f.transport::numeric,      2),
      round(f.net_total::numeric,      2),
      round(f.gst_percentage::numeric, 2),
      round(f.gst_amount::numeric,     2),
      round(f.grand_total::numeric,    2),
      count(*) OVER () AS total_count
    FROM public.quotation_money f
    WHERE f.client_id = $1
      AND f.deleted = false
      AND ($2::text[]      IS NULL OR f.status = ANY($2))
      AND ($3::timestamptz IS NULL OR f.created_at >= $3)
      AND ($4::timestamptz IS NULL OR f.created_at <  $4)
      AND ($5::uuid        IS NULL OR f.customer_id = $5)
      AND ($6::text        IS NULL OR
              f.customer_name ILIKE '%%' || $6 || '%%' OR
              f.quote_no      ILIKE '%%' || $6 || '%%' OR
              f.contact_no    ILIKE '%%' || $6 || '%%')
    ORDER BY %I %s, f.id DESC
    LIMIT $7 OFFSET $8
  $f$, v_sort, v_dir)
  USING
    p_cid,
    p_status,
    p_from,
    p_to,
    p_customer_id,
    v_q,
    v_size,
    (v_page - 1) * v_size;
END;
$$;

COMMENT ON FUNCTION public.search_quotations IS
  'Paged/sorted/filtered quotation search (excludes soft-deleted rows). Serves the '
  'Quotations grid, Customer Ledger and Sales Register. total_count is the FILTERED '
  'count. Money matches src/lib/pricing.ts and lib/models.dart bit-for-bit (float8 math, '
  'per-quote GST). p_cid is validated against x-client-id header when present.';


-- ============================================================================
-- 2. get_quote_stats -- server-side KPI aggregation
-- ============================================================================
-- Converted from LANGUAGE sql (011) to LANGUAGE plpgsql to add the header
-- guard. The query body is identical.

DROP FUNCTION IF EXISTS public.get_quote_stats(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_quote_stats(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_count       bigint,
  draft_count       bigint,
  sent_count        bigint,
  won_count         bigint,
  lost_count        bigint,
  total_quoted      numeric,
  won_quoted        numeric,
  total_grand       numeric,
  won_grand         numeric,
  total_gst         numeric,
  total_transport   numeric,
  total_sqft        numeric,
  win_rate          numeric,
  avg_quote_value   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'get_quote_stats: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status = 'draft')::bigint,
    count(*) FILTER (WHERE status = 'sent')::bigint,
    count(*) FILTER (WHERE status = 'won')::bigint,
    count(*) FILTER (WHERE status = 'lost')::bigint,
    round(coalesce(sum(net_total), 0::float8)::numeric, 2),
    round(coalesce(sum(net_total) FILTER (WHERE status = 'won'), 0::float8)::numeric, 2),
    round(coalesce(sum(grand_total), 0::float8)::numeric, 2),
    round(coalesce(sum(grand_total) FILTER (WHERE status = 'won'), 0::float8)::numeric, 2),
    round(coalesce(sum(gst_amount), 0::float8)::numeric, 2),
    round(coalesce(sum(transport), 0::float8)::numeric, 2),
    round(coalesce(sum(total_sqft), 0::float8)::numeric, 3),
    CASE WHEN count(*) > 0
         THEN round((count(*) FILTER (WHERE status = 'won'))::numeric * 100.0 / count(*)::numeric, 2)
         ELSE 0::numeric END,
    CASE WHEN count(*) > 0
         THEN round((coalesce(sum(net_total), 0::float8) / count(*))::numeric, 2)
         ELSE 0::numeric END
  FROM public.quotation_money
  WHERE client_id = p_cid
    AND deleted = false
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to   IS NULL OR created_at <  p_to);
END;
$$;

COMMENT ON FUNCTION public.get_quote_stats IS
  'Server-side KPI aggregation (excludes soft-deleted rows), replacing the JS for-loop '
  'in /api/portal_stats. total_quoted/won_quoted are PRE-GST (net_total) to match the '
  'existing endpoint; *_grand include per-quote GST. Date range is [p_from, p_to). '
  'p_cid is validated against x-client-id header when present.';


-- ============================================================================
-- 3. product_movement -- product-wise sales report with row cap
-- ============================================================================
-- Converted from LANGUAGE sql to LANGUAGE plpgsql for header guard.
-- Added LIMIT 1000 to each SELECT in the UNION ALL to cap unbounded output.

DROP FUNCTION IF EXISTS public.product_movement(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.product_movement(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  item_type     text,
  description   text,
  code          text,
  total_qty     numeric,
  total_sqft    numeric,
  total_amount  numeric,
  num_quotes    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'product_movement: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    'measured'::text                       AS item_type,
    nullif(btrim(mi.description), '')      AS description,
    nullif(btrim(mi.code), '')             AS code,
    sum(mi.units)::numeric                 AS total_qty,
    round(sum(
        (coalesce(mi.width,  0)::float8 / 304.8)
      * (coalesce(mi.height, 0)::float8 / 304.8))::numeric, 3)
                                           AS total_sqft,
    round(sum(
        (coalesce(mi.width,  0)::float8 / 304.8)
      * (coalesce(mi.height, 0)::float8 / 304.8)
      * coalesce(mi.units, 1)::float8
      * coalesce(mi.rate,  0)::float8)::numeric, 2)
                                           AS total_amount,
    count(DISTINCT mi.quotation_id)        AS num_quotes
  FROM public.measured_items mi
  JOIN public.quotations q ON q.id = mi.quotation_id
  WHERE q.client_id = p_cid
    AND NOT q.deleted
    AND (p_from IS NULL OR q.created_at >= p_from)
    AND (p_to   IS NULL OR q.created_at <  p_to)
  GROUP BY nullif(btrim(mi.description), ''), nullif(btrim(mi.code), '')
  LIMIT 1000  -- cap distinct product groups to prevent unbounded output

  UNION ALL

  SELECT
    'unmeasured'::text                     AS item_type,
    nullif(btrim(ui.description), '')      AS description,
    NULL::text                             AS code,
    sum(ui.units)::numeric                 AS total_qty,
    NULL::numeric                          AS total_sqft,
    round(sum(coalesce(ui.units, 1)::float8
             * coalesce(ui.rate,  0)::float8)::numeric, 2)
                                           AS total_amount,
    count(DISTINCT ui.quotation_id)        AS num_quotes
  FROM public.unmeasured_items ui
  JOIN public.quotations q ON q.id = ui.quotation_id
  WHERE q.client_id = p_cid
    AND NOT q.deleted
    AND (p_from IS NULL OR q.created_at >= p_from)
    AND (p_to   IS NULL OR q.created_at <  p_to)
  GROUP BY nullif(btrim(ui.description), '')
  LIMIT 1000;  -- cap distinct product groups to prevent unbounded output
END;
$$;

COMMENT ON FUNCTION public.product_movement IS
  'Product-wise sales report across a date range. Measured (SFT) and unmeasured (piece) '
  'items UNION ALL''d. total_amount mirrors quotation_money float8 math. Each branch is '
  'capped at 1000 distinct product groups. p_cid is validated against x-client-id header '
  'when present. Serves the Products > Movement drill-down in /console/reports.';


-- ============================================================================
-- 4. win_loss_report -- status breakdown with money
-- ============================================================================
-- Converted from LANGUAGE sql to LANGUAGE plpgsql for header guard.
-- Query body is identical to 011.

DROP FUNCTION IF EXISTS public.win_loss_report(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.win_loss_report(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  status        text,
  count         bigint,
  total_value   numeric,
  grand_total   numeric,
  pct_of_total  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'win_loss_report: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      f.status,
      f.net_total,
      f.grand_total
    FROM public.quotation_money f
    WHERE f.client_id = p_cid
      AND NOT f.deleted
      AND (p_from IS NULL OR f.created_at >= p_from)
      AND (p_to   IS NULL OR f.created_at <  p_to)
  ),
  totals AS (
    SELECT coalesce(sum(net_total), 0::float8) AS sum_net FROM base
  )
  SELECT
    b.status,
    count(*)::bigint,
    round(coalesce(sum(b.net_total),    0::float8)::numeric, 2),
    round(coalesce(sum(b.grand_total),  0::float8)::numeric, 2),
    CASE WHEN t.sum_net > 0
         THEN round((coalesce(sum(b.net_total), 0::float8) / t.sum_net * 100::float8)::numeric, 2)
         ELSE 0::numeric END
  FROM base b
  CROSS JOIN totals t
  GROUP BY b.status, t.sum_net
  ORDER BY coalesce(sum(b.net_total), 0::float8) DESC;
END;
$$;

COMMENT ON FUNCTION public.win_loss_report IS
  'Status breakdown with money across a date range. Serves the Win/Loss report in '
  '/console/reports. total_value is pre-GST (net_total) to match get_quote_stats; '
  'grand_total includes per-quote GST. p_cid is validated against x-client-id header '
  'when present.';


-- ============================================================================
-- 5. gst_summary -- monthly GST-collected report
-- ============================================================================
-- Converted from LANGUAGE sql to LANGUAGE plpgsql for header guard.
-- Query body is identical to 011.

DROP FUNCTION IF EXISTS public.gst_summary(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.gst_summary(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  period        text,
  num_quotes    bigint,
  taxable_value numeric,
  gst_amount    numeric,
  total_value   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'gst_summary: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('month', created_at), 'YYYY-MM'),
    count(*)::bigint,
    round(coalesce(sum(net_total),   0::float8)::numeric, 2),
    round(coalesce(sum(gst_amount),  0::float8)::numeric, 2),
    round(coalesce(sum(grand_total), 0::float8)::numeric, 2)
  FROM public.quotation_money
  WHERE client_id = p_cid
    AND deleted = false
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to   IS NULL OR created_at <  p_to)
  GROUP BY date_trunc('month', created_at)
  ORDER BY date_trunc('month', created_at) DESC;
END;
$$;

COMMENT ON FUNCTION public.gst_summary IS
  'Monthly GST-collected report across a date range. Serves the GST Summary report in '
  '/console/reports. taxable_value = net_total (pre-GST base); gst_amount = total GST '
  'collected; total_value = grand_total. Period is calendar month (YYYY-MM). '
  'p_cid is validated against x-client-id header when present.';


-- ============================================================================
-- 6. tally_export_data -- full quotation + line-items for Tally XML (capped)
-- ============================================================================
-- Converted from LANGUAGE sql to LANGUAGE plpgsql for header guard.
-- Added LIMIT 2000 to cap unbounded Tally export.

DROP FUNCTION IF EXISTS public.tally_export_data(text, timestamptz, timestamptz, text[]);

CREATE OR REPLACE FUNCTION public.tally_export_data(
  p_cid     text,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_status  text[]      DEFAULT ARRAY['sent','won']
)
RETURNS TABLE (
  quotation_id    uuid,
  quote_no        text,
  voucher_date    date,
  customer_name   text,
  customer_gstin  text,
  customer_address text,
  reference       text,
  supplier_company text,
  subtotal        numeric,
  transport       numeric,
  net_total       numeric,
  gst_rate        numeric,
  gst_amount      numeric,
  grand_total     numeric,
  line_items      jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'tally_export_data: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.quote_no,
    q.date,
    coalesce(c.name, q.customer_name),
    coalesce(c.gst_number, ''),
    coalesce(c.address, q.address),
    q.reference,
    q.supplier_company,
    round(m.subtotal::numeric,   2),
    round(m.transport::numeric,  2),
    round(m.net_total::numeric,  2),
    round(m.gst_percentage::numeric, 2),
    round(m.gst_amount::numeric, 2),
    round(m.grand_total::numeric, 2),
    -- Line items as a JSONB array (measured + unmeasured, in creation order).
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'type',         'measured',
          'code',         nullif(btrim(mi.code), ''),
          'description',  nullif(btrim(mi.description), ''),
          'hsn',          '3925',
          'qty',          mi.units,
          'sqft',         round(((coalesce(mi.width,  0)::float8 / 304.8)
                               * (coalesce(mi.height, 0)::float8 / 304.8))::numeric, 3),
          'rate',         mi.rate,
          'amount',       round(((coalesce(mi.width,  0)::float8 / 304.8)
                               * (coalesce(mi.height, 0)::float8 / 304.8)
                               * coalesce(mi.units, 1)::float8
                               * coalesce(mi.rate,  0)::float8)::numeric, 2),
          'unit',         'SFT'
        ) ORDER BY mi.created_at, mi.id
      )
      FROM public.measured_items mi
      WHERE mi.quotation_id = q.id
    ), '[]'::jsonb)
    ||
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'type',         'unmeasured',
          'code',         nullif(btrim(ui.description), ''),
          'description',  nullif(btrim(ui.description), ''),
          'hsn',          '3925',
          'qty',          ui.units,
          'sqft',         NULL,
          'rate',         ui.rate,
          'amount',       round((coalesce(ui.units, 1)::float8
                               * coalesce(ui.rate,  0)::float8)::numeric, 2),
          'unit',         'NOS'
        ) ORDER BY ui.created_at, ui.id
      )
      FROM public.unmeasured_items ui
      WHERE ui.quotation_id = q.id
    ), '[]'::jsonb)
  FROM public.quotations q
  JOIN public.quotation_money m ON m.id = q.id
  LEFT JOIN public.customers c ON c.id = q.customer_id
  WHERE q.client_id = p_cid
    AND NOT q.deleted
    AND (p_from    IS NULL OR q.created_at >= p_from)
    AND (p_to      IS NULL OR q.created_at <  p_to)
    AND (p_status  IS NULL OR m.status = ANY(p_status))
  ORDER BY q.created_at DESC, q.id DESC
  LIMIT 2000;  -- cap: prevent unbounded Tally XML export from exhausting pooler memory
END;
$$;

COMMENT ON FUNCTION public.tally_export_data IS
  'Full quotation + line-items for Tally XML Import generation (capped at 2000 rows). '
  'One row per voucher. line_items is a JSONB array of '
  '{type,code,description,hsn,qty,sqft,rate,amount,unit}. '
  'GST is exposed as a single gst_rate/gst_amount; the app splits into CGST/SGST/IGST. '
  'Defaults to sent+won quotations. p_cid is validated against x-client-id header when '
  'present. Serves GET /api/console/export?format=tally.';


-- ============================================================================
-- 7. bulk_status_update -- capped, per-id validated status change
-- ============================================================================
-- Same as 011 version with one addition: p_cid header guard at top of BEGIN.

DROP FUNCTION IF EXISTS public.bulk_status_update(text, uuid[], text);

CREATE OR REPLACE FUNCTION public.bulk_status_update(
  p_cid        text,
  p_ids        uuid[],
  p_new_status text
)
RETURNS TABLE (
  quotation_id  uuid,
  success       boolean,
  message       text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cap    integer := 500;
  v_status text   := lower(btrim(coalesce(p_new_status, '')));
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'bulk_status_update: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  -- (a) cap
  IF array_length(p_ids, 1) > v_cap THEN
    RAISE EXCEPTION 'bulk_status_update: max % ids per request, got %', v_cap, array_length(p_ids, 1);
  END IF;

  -- validate status
  IF NOT (v_status = ANY(ARRAY['draft','sent','won','lost'])) THEN
    RAISE EXCEPTION 'bulk_status_update: invalid status "%" -- must be draft|sent|won|lost', v_status;
  END IF;

  -- Perform the update (only matching, non-deleted rows).
  UPDATE public.quotations
  SET status = v_status
  WHERE id = ANY(p_ids)
    AND client_id = p_cid
    AND deleted = false;

  -- (c) per-id result.
  RETURN QUERY
  SELECT
    i.id,
    (q.id IS NOT NULL),
    CASE
      WHEN q.id IS NOT NULL                          THEN 'Updated to "' || v_status || '"'
      WHEN EXISTS (SELECT 1 FROM public.quotations x WHERE x.id = i.id AND x.deleted)
                                                     THEN 'Failed: quotation is deleted'
      WHEN EXISTS (SELECT 1 FROM public.quotations x WHERE x.id = i.id AND x.client_id <> p_cid)
                                                     THEN 'Failed: not owned by client'
      ELSE 'Failed: quotation not found'
    END
  FROM unnest(p_ids) AS i(id)
  LEFT JOIN public.quotations q
         ON q.id = i.id
        AND q.client_id = p_cid
        AND NOT q.deleted
  ORDER BY i.id;
END;
$$;

COMMENT ON FUNCTION public.bulk_status_update IS
  'Bulk status change, capped at 500 ids. Re-validates client_id per id, returns '
  'per-id success/failure. Status must be draft|sent|won|lost. '
  'p_cid is validated against x-client-id header when present. '
  'Serves POST /api/console/quotations/bulk (action=status).';


-- ============================================================================
-- 8. bulk_delete -- capped, per-id validated soft-delete
-- ============================================================================
-- Same as 011 version with one addition: p_cid header guard at top of BEGIN.

DROP FUNCTION IF EXISTS public.bulk_delete(text, uuid[]);

CREATE OR REPLACE FUNCTION public.bulk_delete(
  p_cid  text,
  p_ids  uuid[]
)
RETURNS TABLE (
  quotation_id  uuid,
  success       boolean,
  message       text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cap integer := 500;
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'bulk_delete: p_cid (client_id) is required';
  END IF;

  -- Belt-and-braces: verify p_cid matches the RLS header
  IF current_setting('request.headers', true) IS NOT NULL
     AND current_setting('request.headers', true) != '' THEN
    IF p_cid != current_setting('request.headers', true)::json->>'x-client-id' THEN
      RAISE EXCEPTION 'client_id mismatch: p_cid (%) does not match x-client-id header', p_cid;
    END IF;
  END IF;

  IF array_length(p_ids, 1) > v_cap THEN
    RAISE EXCEPTION 'bulk_delete: max % ids per request, got %', v_cap, array_length(p_ids, 1);
  END IF;

  -- Soft-delete only matching, currently-live rows.
  UPDATE public.quotations
  SET deleted = true
  WHERE id = ANY(p_ids)
    AND client_id = p_cid
    AND NOT deleted;

  -- Per-id result.
  RETURN QUERY
  SELECT
    i.id,
    (q.id IS NULL),
    CASE
      WHEN q.id IS NULL                          THEN 'Soft-deleted'
      WHEN EXISTS (SELECT 1 FROM public.quotations x WHERE x.id = i.id AND x.deleted AND x.client_id = p_cid)
                                                   THEN 'Already deleted'
      WHEN EXISTS (SELECT 1 FROM public.quotations x WHERE x.id = i.id AND x.client_id <> p_cid)
                                                   THEN 'Failed: not owned by client'
      ELSE 'Failed: quotation not found'
    END
  FROM unnest(p_ids) AS i(id)
  LEFT JOIN public.quotations q
         ON q.id = i.id
        AND q.client_id = p_cid
        AND NOT q.deleted
  ORDER BY i.id;
END;
$$;

COMMENT ON FUNCTION public.bulk_delete IS
  'Soft-delete (sets deleted=true), capped at 500 ids. Re-validates client_id per '
  'id, returns per-id success/failure. p_cid is validated against x-client-id header '
  'when present. Restore via UPDATE quotations SET deleted=false. '
  'Serves POST /api/console/quotations/bulk (action=delete).';


-- ============================================================================
-- Grants (unchanged from 011)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.search_quotations(text, text, text[], timestamptz, timestamptz, uuid, text, text, integer, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quote_stats(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT SELECT ON public.quotation_money TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_movement(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.win_loss_report(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gst_summary(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tally_export_data(text, timestamptz, timestamptz, text[])
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_status_update(text, uuid[], text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_delete(text, uuid[])
  TO anon, authenticated, service_role;


COMMIT;

NOTIFY pgrst, 'reload schema';
