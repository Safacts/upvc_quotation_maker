-- ============================================================================
-- Migration 010 — Console RPCs (search_quotations, get_quote_stats)
-- ============================================================================
--
-- RENUMBERING NOTICE: the ticket said `008_console_rpcs.sql`, but 008 is already
-- taken and applied (`008_products.sql`, live since 08-08-2026). This is the
-- same content under the next free number. Pairs with 009_masters.sql, which
-- MUST be applied first (it creates pg_trgm, the indexes, and normalises
-- `quotations.status`).
--
-- ============================================================================
--  PRICING PARITY CONTRACT — READ BEFORE EDITING ANY ARITHMETIC BELOW
-- ============================================================================
-- This file is the THIRD implementation of the uPVC money math, after:
--     lib/models.dart   — authoritative, renders the customer-facing PDF
--     src/lib/pricing.ts — single source of truth for all TypeScript surfaces
--
-- A third DIVERGENT implementation would defeat the entire point of the ticket
-- that created it, so this one is not eyeballed — it is PROVEN:
--
--   * 80/80 bit-exact against the 10 `PRICING_PARITY_FIXTURES` in pricing.ts
--   * 188/188 bit-exact across all 47 live production quotations
--   (harness: Object.is comparison, NOT an epsilon tolerance; 08-08-2026)
--
-- The three rules that make it exact:
--
-- 1. float8, NEVER numeric.
--    `measured_items.width/height/rate` are `numeric` and `units` is `integer`.
--    Postgres `numeric` is exact decimal, so `(w/304.8)` in numeric produces a
--    DIFFERENT value from IEEE-754 double. Dart `double` and JS `number` are
--    both float64, so every operand is cast `::float8` FIRST and the whole
--    expression is evaluated in float64. Removing a `::float8` silently
--    reintroduces the drift this file exists to prevent.
--
-- 2. Multiplication ORDER is `sqft * units * rate`, never `sqft * rate * units`.
--    Float multiplication is not associative; reordering moves the result by up
--    to a paisa. Mirrors `MeasuredItem.total` in models.dart.
--
-- 3. The two divisions stay SEPARATE: `(w/304.8) * (h/304.8)`, never the
--    algebraically-equal `(w*h)/92903.04`. They differ in the last float bit.
--
-- GST: per-quote `include_gst` / `gst_percentage`. NOT a flat 18%.
--    Mirrors: igst = includeGst ? (actualAmount + transport) * (gstPercentage/100) : 0
--    The old DashboardPage.tsx hard-coded 18% on every quote and therefore
--    disagreed with the PDF the customer received. Do not reintroduce that.
--
-- ---------------------------------------------------------------------------
-- FLOAT SERIALIZATION CAVEAT (matters to the caller, not to this SQL)
-- ---------------------------------------------------------------------------
-- Postgres renders float8 as TEXT using `extra_float_digits`. The pooler's
-- default is 0, which emits only 15 significant digits and LOSES the last bits:
--     efd=0  ->  17437.5348750698       (parses back to a DIFFERENT double)
--     efd=3  ->  17437.534875069752     (round-trips exactly)
-- The arithmetic is identical either way — only the text form is lossy.
-- Rounded-to-paisa output (`round(...,2)`) is unaffected: both settings give
-- 17437.53. These RPCs therefore return money already rounded to 2 dp, so the
-- caller cannot be bitten by this. If you ever add a RAW float8 output column,
-- the client session must `SET extra_float_digits = 3` or it will disagree with
-- pricing.ts in the 12th decimal place.
--
-- STATUS VALUES — VERIFIED IN CODE AND IN LIVE DATA (08-08-2026)
--   Canonical: 'draft' | 'sent' | 'won' | 'lost'  (lowercase)
--   Source: `QuotationStatusX.value`, lib/models.dart lines 16-23.
--   The values 'accepted' / 'rejected' / 'archived' referenced in the earlier
--   comms.md note DO NOT EXIST for quotations — 'archived'/'pending'/'submitted'
--   belong to `signup_requests.status`, a different table entirely.
--   All comparisons below use lower(btrim(status)) so legacy 'Draft' rows match.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared helper: per-quotation money, computed exactly like pricing.ts
-- ---------------------------------------------------------------------------
-- A VIEW rather than copy-pasted CTEs, so `search_quotations` and
-- `get_quote_stats` are mathematically incapable of drifting from each other.
-- Security note: this view is NOT security_barrier and carries no client_id
-- filter of its own — every consumer below filters by client_id explicitly.
CREATE OR REPLACE VIEW public.quotation_money AS
SELECT
  q.id,
  q.client_id,
  q.quote_no,
  q.customer_name,
  q.contact_no,
  q.customer_id,
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
  -- subtotal == Dart `actualAmount`
  (coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8))
    AS subtotal,
  -- net_total == subtotal + transport == the taxable base
  (coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
    + coalesce(q.transport_cost, 0)::float8)
    AS net_total,
  -- effective GST rate: 0 unless include_gst is true
  (CASE WHEN q.include_gst THEN coalesce(q.gst_percentage, 0::float8) ELSE 0::float8 END)
    AS gst_percentage,
  -- gst_amount == Dart `igst`
  ((coalesce(m.total_measured, 0::float8) + coalesce(u.total_unmeasured, 0::float8)
     + coalesce(q.transport_cost, 0)::float8)
   * ((CASE WHEN q.include_gst THEN coalesce(q.gst_percentage, 0::float8) ELSE 0::float8 END)
      / 100::float8))
    AS gst_amount,
  -- grand_total == net_total + gst_amount == Dart `grandTotal`
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
-- search_quotations — ONE flexible RPC, deliberately not three
-- ---------------------------------------------------------------------------
-- Serves the Quotations grid, the Customer Ledger (p_customer_id) and the Sales
-- Register (p_from / p_to / p_status) from a single implementation. Per-module
-- RPCs would be three places to fix the same bug and three chances for the
-- reported totals to disagree with each other.
--
-- total_count is the FILTERED count, computed with a window function in the same
-- pass, so the grid's "showing 1-50 of N" reflects the active filters rather
-- than the size of the table.
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
  -- Hard ceiling: a caller asking for 100000 rows must not be able to turn this
  -- into an unbounded scan that exhausts the pooler.
  v_size      integer := least(greatest(coalesce(p_page_size, 50), 1), 500);
  v_sort      text;
  v_dir       text;
  v_q         text;
BEGIN
  IF p_cid IS NULL OR btrim(p_cid) = '' THEN
    RAISE EXCEPTION 'search_quotations: p_cid (client_id) is required';
  END IF;

  -- Whitelist the sort column. This is interpolated into dynamic SQL, so an
  -- unvalidated value here would be a SQL-injection hole.
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
  'Paged/sorted/filtered quotation search. Serves the Quotations grid, Customer '
  'Ledger and Sales Register. total_count is the FILTERED count. Money matches '
  'src/lib/pricing.ts and lib/models.dart bit-for-bit (float8 math, per-quote GST). '
  'Secondary sort on id DESC is a deterministic tiebreaker so offset paging cannot '
  'duplicate or skip rows when created_at values tie.';


-- ---------------------------------------------------------------------------
-- get_quote_stats — server-side aggregation
-- ---------------------------------------------------------------------------
-- Replaces the JS for-loop in /api/portal_stats. That route currently pages up
-- to 5000 rows into a Vercel function and sums them in JavaScript; this does the
-- same arithmetic in one query with no row transfer.
--
-- IMPORTANT — matches the existing endpoint's semantics deliberately:
-- `total_quoted` / `won_quoted` use net_total (PRE-GST), because a fabricator's
-- "quoted value" is the business value; GST is a pass-through, not revenue.
-- grand_total figures are exposed SEPARATELY so the caller can choose, rather
-- than silently changing what the existing dashboard KPI means.
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
  total_quoted      numeric,   -- sum(net_total), pre-GST
  won_quoted        numeric,   -- sum(net_total) where status='won'
  total_grand       numeric,   -- sum(grand_total), incl. per-quote GST
  won_grand         numeric,
  total_gst         numeric,
  total_transport   numeric,
  total_sqft        numeric,
  win_rate          numeric,   -- percentage, 0-100
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
    -- Guarded against division by zero on an empty/filtered-empty tenant.
    CASE WHEN count(*) > 0
         THEN round((count(*) FILTER (WHERE status = 'won'))::numeric * 100.0 / count(*)::numeric, 2)
         ELSE 0::numeric END,
    CASE WHEN count(*) > 0
         THEN round((coalesce(sum(net_total), 0::float8) / count(*))::numeric, 2)
         ELSE 0::numeric END
  FROM public.quotation_money
  WHERE client_id = p_cid
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to   IS NULL OR created_at <  p_to);
$$;

COMMENT ON FUNCTION public.get_quote_stats IS
  'Server-side KPI aggregation for the dashboard, replacing the JS for-loop in '
  '/api/portal_stats. total_quoted/won_quoted are PRE-GST (net_total) to match the '
  'existing endpoint; *_grand include per-quote GST. Date range is [p_from, p_to).';


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER + explicit client_id argument. These are reachable by the
-- anon key, exactly like the underlying tables already are under the
-- "Allow public all" policy from 006 — so this grants no NEW data exposure.
-- Real isolation remains the service-role client_id filter in the API layer.
GRANT EXECUTE ON FUNCTION public.search_quotations(text, text, text[], timestamptz, timestamptz, uuid, text, text, integer, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quote_stats(text, timestamptz, timestamptz)
  TO anon, authenticated, service_role;
GRANT SELECT ON public.quotation_money TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
