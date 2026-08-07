-- Vitharn ERP Services' OWN invoices (Vitharn -> its SaaS clients).
--
-- NOT to be confused with `gst_invoices` (004), which is the per-tenant module
-- letting a UPVC fabricator invoice THEIR customers with 18% CGST/SGST.
-- This table is Vitharn's internal accounts-receivable: subscription and setup
-- fees billed to clients like Venkateshwara / KPR, at NIL GST (turnover is
-- below the Rs.20,00,000 threshold, Section 22 CGST Act 2017).
--
-- Idempotent — safe to re-run. Apply via the pooler
-- (aws-1-ap-south-1.pooler.supabase.com:5432, user postgres.effxrwrbsjduvhmorvrq),
-- then run: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS vitharn_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  invoice_date   date NOT NULL DEFAULT CURRENT_DATE,
  due_date       date,
  payment_terms  text NOT NULL DEFAULT 'Due on receipt',

  -- Billed party. client_id links to clients.id when the payer is an existing
  -- tenant; left NULL for prospects/one-off work.
  client_id      text,
  client_name    text NOT NULL DEFAULT '',
  client_company text NOT NULL DEFAULT '',
  client_address text NOT NULL DEFAULT '',
  client_email   text NOT NULL DEFAULT '',
  client_phone   text NOT NULL DEFAULT '',

  -- Money. GST is always NIL for now; the columns exist so that crossing the
  -- registration threshold later is a data change, not a schema migration.
  subtotal       numeric NOT NULL DEFAULT 0,
  gst_rate       numeric NOT NULL DEFAULT 0,
  gst_amount     numeric NOT NULL DEFAULT 0,
  total          numeric NOT NULL DEFAULT 0,

  notes          text NOT NULL DEFAULT '',
  -- draft | sent | paid | cancelled
  status         text NOT NULL DEFAULT 'draft',
  paid_on        date,
  sent_at        timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vitharn_invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES vitharn_invoices(id) ON DELETE CASCADE,
  sno         integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  details     text NOT NULL DEFAULT '',
  qty         numeric NOT NULL DEFAULT 1,
  amount      numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitharn_invoices_client_id ON vitharn_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_vitharn_invoices_status    ON vitharn_invoices(status);
CREATE INDEX IF NOT EXISTS idx_vitharn_invoice_items_inv  ON vitharn_invoice_items(invoice_id);

-- Per-financial-year counter -> VIT/2026-2027/0001
CREATE TABLE IF NOT EXISTS vitharn_invoice_counters (
  fy          text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION get_next_vitharn_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy     text;
  next_num integer;
BEGIN
  -- Indian financial year runs Apr -> Mar.
  IF extract(month from current_date) >= 4 THEN
    v_fy := extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text;
  ELSE
    v_fy := (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text;
  END IF;

  INSERT INTO vitharn_invoice_counters (fy, last_number)
  VALUES (v_fy, 1)
  ON CONFLICT (fy)
  DO UPDATE SET last_number = vitharn_invoice_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'VIT/' || v_fy || '/' || lpad(next_num::text, 4, '0');
END;
$$;

-- These tables are Vitharn-internal. No tenant may read them, so RLS is enabled
-- with NO permissive policy: anon/authenticated get zero rows. All access goes
-- through the service-role key in app/api/invoice/*, which is admin-gated.
ALTER TABLE vitharn_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitharn_invoice_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitharn_invoice_counters  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON vitharn_invoices         FROM anon, authenticated;
REVOKE ALL ON vitharn_invoice_items    FROM anon, authenticated;
REVOKE ALL ON vitharn_invoice_counters FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
