-- ============================================================================
-- Migration 011 — Phase 2: Reports, Tally XML export, Bulk ops
-- ============================================================================
--
-- SCOPE
--   Phase 2 of the desktop-dashboard architecture (docs/desktop-dashboard-architecture.md §7):
--   "Reports, bulk ops, exports (~1 week). Sales register, customer ledger,
--   product movement, win/loss, GST summary. Bulk status/export/email.
--   CSV + XLSX + Tally XML."
--
--   Sales register and Customer LEDGER are already served by the Phase 0
--   search_quotations RPC (date range + status + p_customer_id respectively).
--   This migration therefore adds the three report shapes that search_quotations
--   CANNOT produce, the Tally XML export data function, bulk-operation RPCs,
--   and the soft-delete column those bulk ops rely on.
--
-- WHAT'S NEW
--   1. quotations.deleted            — soft-delete flag (consistent with customers/products.soft_deleted)
--   2. quotation_money (updated)     — exposes `deleted` so consumers can filter
--   3. search_quotations (updated)   — excludes deleted rows from the grid
--   4. get_quote_stats (updated)     — excludes deleted rows from the KPIs
--   5. product_movement()            — product-wise sales report (measured + unmeasured)
--   6. win_loss_report()             — status breakdown with money
--   7. gst_summary()                 — monthly GST-collected report
--   8. tally_export_data()           — full quotation + line-items for Tally XML generation
--   9. bulk_status_update()          — capped, per-id validated status change
--  10. bulk_delete()                 — capped, per-id validated soft-delete
--
-- PREREQUISITES
--   009_masters.sql  +  010_console_rpcs.sql  MUST be applied first (they create
--   pg_trgm, quotation_money, search_quotations, get_quote_stats).
--
-- RLS CONTRACT (unchanged from 006/009/010)
--   Tenant scope is enforced in the APPLICATION LAYER via the service-role
--   `client_id` filter, NOT via RLS. The service-role key bypasses RLS entirely,
--   so `.eq("client_id", clientId)` in the API route IS the isolation boundary.
--   Every RPC below takes `p_cid text` as its first argument and filters on it
--   internally. They are SECURITY INVOKER + explicit GRANT EXECUTE, matching the
--   convention established in 006_secure_quotations.sql.
--
-- IDEMPOTENT — safe to re-run. Apply via the pooler
--   host aws-0-ap-northeast-1.pooler.supabase.com:5432
--   user postgres.gumpmnbjdtzajhysnnaz
-- then run:  NOTIFY pgrst, 'reload schema';
--
-- TAKE A BACKUP FIRST:  scripts\run_backup.bat
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. quotations.deleted — soft-delete flag
-- ---------------------------------------------------------------------------
-- Consistent with customers.soft_deleted / products.soft_deleted (Phase 0).
-- A soft-deleted quotation is excluded from the grid, reports and stats, but
-- remains in the database for audit. Undelete = SET deleted = false.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

-- Partial index: the live-quote list is always "this tenant, not deleted".
-- Indexing only WHERE deleted = false keeps the index tiny (it excludes the
-- vast majority of rows as the table grows).
CREATE INDEX IF NOT EXISTS quotations_client_live_idx
  ON public.quotations (client_id) WHERE deleted = false;


-- ---------------------------------------------------------------------------
-- 2. quotation_money — expose the new `deleted` column
-- ---------------------------------------------------------------------------
-- The view already computes all money; we only add the flag so consumers can
-- filter. We deliberately do NOT filter here — the same view can serve both
-- "live" and "include-deleted" consumers (audit, restore).
--
-- PostgreSQL cannot REPLACE a view whose column set has changed (it refuses to
-- silently drop/rename columns), so we DROP + CREATE.
DROP VIEW IF EXISTS public.quotation_money;
CREATE VIEW public.quotation_money AS
SELECT
  q.id,
  q.client_id,
  q.quote_no,
  q.customer_name,
  q.contact_no,
  q.customer_id,
  q.deleted,
  lower(btrim(coalesce(q.status, 'draft'))) AS status,
  q.created_at,
  q.date,
  q.reference,
  q.supplier_company,
  q.include_gst,
  coalesce(q.gst_percentage, 0::float8)     AS gst_percentage_raw,
  coalesce(m.total_measured,   0::float8)   AS total_measured,
  coalesce(u.total_unmeasured, 0::float8)   AS total_unmeasured,
  coalesce(m.total_sqft,       0::float8)   AS total_sqft,
  coalesce(q.transport_cost, 0)::float8     AS transport,
  (coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8))
    AS subtotal,
  (coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
    + coalesce(q.transport_cost, 0)::float8)
    AS net_total,
  (CASE WHEN q.include_gst THEN coalesce(q.gst_percentage, 0::float8) ELSE 0::float8 END)
    AS gst_percentage,
  ((coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
     + coalesce(q.transport_cost, 0)::float8)
   * ((CASE WHEN q.include_gst THEN coalesce(q.gst_percentage, 0::float8) ELSE 0::float8 END)
      / 100::float8))
    AS gst_amount,
  ((coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
     + coalesce(q.transport_cost, 0)::float8)
   + ((coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
        + coalesce(q.transport_cost, 0)::float8)
      * ((CASE WHEN q.include_gst THEN coalesce(q.gst_percentage, 0::float8) ELSE 0::float8 END)
         / 100::float8)))
    AS grand_total
FROM public.quotations q
LEFT JOIN LATERAL (
  SELECT
    -- (w/304.8) * (h/304.8) * units * rate   <- order and grouping are load-bearing
    sum(((coalesce(mi.width,  0)::float8 / 304.8)
       * (coalesce(mi.height, 0)::float8 / 304.8))
       * coalesce(mi.units, 1)::float8
       * coalesce(mi.rate,  0)::float8) AS total_measured,
    sum(((coalesce(mi.width,  0)::float8 / 304.8)
       * (coalesce(mi.height, 0)::float8 / 304.8))
       * coalesce(mi.units, 1)::float8) AS total_sqft
  FROM public.measured_items mi
  WHERE mi.quotation_id = q.id
) m ON true
LEFT JOIN LATERAL (
  SELECT sum(coalesce(ui.units, 1)::float8 * coalesce(ui.rate, 0)::float8) AS total_unmeasured
  FROM public.unmeasured_items ui
  WHERE ui.quotation_id = q.id
) u ON true;


-- ---------------------------------------------------------------------------
-- 3. search_quotations — exclude deleted rows
-- ---------------------------------------------------------------------------
-- We recreate the function (it was created in 010) and add one extra predicate
-- to the dynamic WHERE: `f.deleted = false`. Everything else is identical to
-- 010 so the two cannot drift. Keeping the full function body here (rather than
-- ALTER) is deliberate — Supabase does not version functions, so the latest
-- applied migration must contain the authoritative definition.
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
  'per-quote GST). Secondary sort on id DESC is a deterministic tiebreaker so offset '
  'paging cannot duplicate or skip rows when created_at values tie.';


-- ---------------------------------------------------------------------------
-- 4. get_quote_stats — exclude deleted rows
-- ---------------------------------------------------------------------------
-- Same semantics as 010, but `AND deleted = false` so soft-deleted quotations
-- stop counting toward KPIs and "win rate".
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.get_quote_stats IS
  'Server-side KPI aggregation (excludes soft-deleted rows), replacing the JS for-loop '
  'in /api/portal_stats. total_quoted/won_quoted are PRE-GST (net_total) to match the '
  'existing endpoint; *_grand include per-quote GST. Date range is [p_from, p_to).';


-- ---------------------------------------------------------------------------
-- 5. product_movement — product-wise sales report
-- ---------------------------------------------------------------------------
-- Aggregates line items across quotations within a date range. Measured and
-- unmeasured items are UNION ALL'd so one report covers both. uPVC fabricators
-- sell a mix of SFT-priced (measured) and per-piece (unmeasured) items.
--
-- float8 math mirrors quotation_money (width/304.8)*(height/304.8)*units*rate
-- — cast every operand to float8 FIRST (the rule from 010).
DROP FUNCTION IF EXISTS public.product_movement(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.product_movement(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  item_type     text,        -- 'measured' | 'unmeasured'
  description   text,
  code          text,
  total_qty     numeric,     -- sum of units
  total_sqft    numeric,     -- measured only; NULL for unmeasured
  total_amount  numeric,     -- sum of line totals
  num_quotes    bigint       -- distinct quotations containing this item
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.product_movement IS
  'Product-wise sales report across a date range. Measured (SFT) and unmeasured (piece) '
  'items UNION ALL''d. total_amount mirrors quotation_money float8 math. Serves the '
  'Products > Movement drill-down in /console/reports.';


-- ---------------------------------------------------------------------------
-- 6. win_loss_report — status breakdown with money
-- ---------------------------------------------------------------------------
-- One row per status present in the tenant's data. The DashboardPage/Overview
-- KPI cards already come from get_quote_stats; this report is the detailed
-- drill-down with per-status money and percentage.
DROP FUNCTION IF EXISTS public.win_loss_report(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.win_loss_report(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  status        text,
  count         bigint,
  total_value   numeric,   -- net_total (pre-GST), matches get_quote_stats semantics
  grand_total   numeric,   -- incl. per-quote GST
  pct_of_total  numeric    -- share of the tenant's total net_value, 0-100
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.win_loss_report IS
  'Status breakdown with money across a date range. Serves the Win/Loss report in '
  '/console/reports. total_value is pre-GST (net_total) to match get_quote_stats; '
  'grand_total includes per-quote GST. pct_of_total is the share of the tenant''s '
  'total net_value within the filtered range.';


-- ---------------------------------------------------------------------------
-- 7. gst_summary — monthly GST-collected report
-- ---------------------------------------------------------------------------
-- Period-wise GST collection. Groups by calendar month (YYYY-MM). Serves the
-- GST Summary report and feeds the accountant's monthly filing reconciliation.
DROP FUNCTION IF EXISTS public.gst_summary(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.gst_summary(
  p_cid   text,
  p_from  timestamptz DEFAULT NULL,
  p_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  period        text,        -- 'YYYY-MM'
  num_quotes    bigint,
  taxable_value numeric,     -- net_total (subtotal + transport), the GST base
  gst_amount    numeric,     -- total GST collected this period
  total_value   numeric      -- grand_total (taxable + GST)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.gst_summary IS
  'Monthly GST-collected report across a date range. Serves the GST Summary report in '
  '/console/reports. taxable_value = net_total (pre-GST base); gst_amount = total GST '
  'collected; total_value = grand_total. Period is calendar month (YYYY-MM).';


-- ---------------------------------------------------------------------------
-- 8. tally_export_data — full quotation + line-items for Tally XML generation
-- ---------------------------------------------------------------------------
-- Returns one row per quotation in the filter, with line items aggregated into
  -- a JSONB array. The application layer iterates these rows and emits one
-- <VOUPEER> per row in Tally XML Import format.
--
-- WHY JSONB AND NOT A JOIN: a JOIN of quotations to their N line items would
-- repeat the header N times, forcing the app to de-duplicate. One JSON array
-- per quotation keeps the contract clean: one row = one Tally voucher.
--
-- The line items carry everything Tally needs for an inventory-integrated sales
-- voucher: description, HSN (3925 = builders' ware of plastics), quantity, rate,
-- unit and amount. Transport and GST live on the header row so the app can emit
-- them as separate <LEDGER> and <INVENTORY> entries.
--
-- GST is stored on the quotation as a single gst_percentage (could be IGST or
-- CGST+SGST depending on the buyer's state). The app decides the ledger split;
-- here we expose gst_rate and gst_amount and let the caller divide.
--
-- DEFAULT FILTER: only 'sent' and 'won' quotations — drafts are not vouchers.
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    -- Empty array if a quotation has no line items (edge case: empty quote).
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
  ORDER BY q.created_at DESC, q.id DESC;
$$;

COMMENT ON FUNCTION public.tally_export_data IS
  'Full quotation + line-items for Tally XML Import generation. One row per voucher. '
  'line_items is a JSONB array of {type,code,description,hsn,qty,sqft,rate,amount,unit}. '
  'GST is exposed as a single gst_rate/gst_amount; the app splits into CGST/SGST/IGST. '
  'Defaults to sent+won quotations. Serves GET /api/console/export?format=tally.';


-- ---------------------------------------------------------------------------
-- 9. bulk_status_update — capped, per-id validated status change
-- ---------------------------------------------------------------------------
-- Backend rule (architecture §5.5): every bulk endpoint is
--   (a) capped at 500 ids/request,
--   (b) re-validates client_id on EVERY id server-side — never trusting the list
--   (c) returns a per-id result array so partial failures are visible, not silent.
--
-- This function does (a), (b), (c) in one transaction. Ids that don't exist or
-- belong to another tenant are reported as failed rows; valid ids are updated.
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
  -- (a) cap
  IF array_length(p_ids, 1) > v_cap THEN
    RAISE EXCEPTION 'bulk_status_update: max % ids per request, got %', v_cap, array_length(p_ids, 1);
  END IF;

  -- validate status
  IF NOT (v_status = ANY(ARRAY['draft','sent','won','lost'])) THEN
    RAISE EXCEPTION 'bulk_status_update: invalid status "%" — must be draft|sent|won|lost', v_status;
  END IF;

  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'bulk_status_update: p_cid (client_id) is required';
  END IF;

  -- Perform the update (only matching, non-deleted rows).
  UPDATE public.quotations
  SET status = v_status
  WHERE id = ANY(p_ids)
    AND client_id = p_cid
    AND deleted = false;

  -- (c) per-id result. LEFT JOIN the input list against the rows that were
  -- actually matchable (correct client, not deleted). Missing = failed.
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
  'per-id success/failure. Status must be draft|sent|won|lost. Serves POST '
  '/api/console/quotations/bulk (action=status).';


-- ---------------------------------------------------------------------------
-- 10. bulk_delete — capped, per-id validated soft-delete
-- ---------------------------------------------------------------------------
-- Soft-delete (sets deleted = true). Undo via bulk_status_update won't work for
-- restore — the app should call UPDATE quotations SET deleted=false directly or
-- via a dedicated restore endpoint. Same 500-id cap + per-id validation as
-- bulk_status_update.
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
  IF array_length(p_ids, 1) > v_cap THEN
    RAISE EXCEPTION 'bulk_delete: max % ids per request, got %', v_cap, array_length(p_ids, 1);
  END IF;

  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'bulk_delete: p_cid (client_id) is required';
  END IF;

  -- Soft-delete only matching, currently-live rows.
  UPDATE public.quotations
  SET deleted = true
  WHERE id = ANY(p_ids)
    AND client_id = p_cid
    AND NOT deleted;

  -- Per-id result. q matches rows that are STILL live + owned + deleted=false
  -- after the update — i.e. rows that were NOT successfully soft-deleted.
  RETURN QUERY
  SELECT
    i.id,
    (q.id IS NULL),   -- success = the row is no longer live+owned+undeleted
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
  'id, returns per-id success/failure. Restore via UPDATE quotations SET deleted=false. '
  'Serves POST /api/console/quotations/bulk (action=delete).';


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Same convention as 010: SECURITY INVOKER + explicit client_id argument +
-- GRANT EXECUTE to anon/authenticated/service_role. The "Allow public all"
-- policy on the underlying tables already permits anon reads, so this grants
-- no NEW data exposure. Real isolation = the service-role client_id filter in
-- the API layer.
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
