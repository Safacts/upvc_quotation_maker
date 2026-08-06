-- GST Invoices tables and RPC for UPVC quotation maker
-- Telangana-focused: CGST+SGST (intra-state) default, IGST optional

CREATE TABLE IF NOT EXISTS gst_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_company_name text NOT NULL DEFAULT '',
  supplier_address text NOT NULL DEFAULT '',
  supplier_gstin text NOT NULL DEFAULT '',
  supplier_state text NOT NULL DEFAULT 'Telangana',
  supplier_state_code text NOT NULL DEFAULT '36',
  buyer_name text NOT NULL DEFAULT '',
  buyer_address text NOT NULL DEFAULT '',
  buyer_gstin text NOT NULL DEFAULT '',
  buyer_state text NOT NULL DEFAULT '',
  buyer_state_code text NOT NULL DEFAULT '',
  place_of_supply text NOT NULL DEFAULT 'Telangana',
  place_of_supply_code text NOT NULL DEFAULT '36',
  is_interstate boolean NOT NULL DEFAULT false,
  is_reverse_charge boolean NOT NULL DEFAULT false,
  source_quotation_id uuid,
  transport_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  taxable_value numeric NOT NULL DEFAULT 0,
  cgst_rate numeric NOT NULL DEFAULT 9.0,
  sgst_rate numeric NOT NULL DEFAULT 9.0,
  igst_rate numeric NOT NULL DEFAULT 0.0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  amount_in_words text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gst_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES gst_invoices(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  sno integer NOT NULL,
  hsn_code text NOT NULL DEFAULT '3925',
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'SFT',
  rate numeric NOT NULL DEFAULT 0,
  taxable_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gst_invoices_client_id ON gst_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_invoice_number ON gst_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_gst_invoice_items_invoice_id ON gst_invoice_items(invoice_id);

-- RLS
ALTER TABLE gst_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_gst_invoices" ON gst_invoices
  USING (client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))
  WITH CHECK (client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text));

CREATE POLICY "tenant_isolation_gst_invoice_items" ON gst_invoice_items
  USING (client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))
  WITH CHECK (client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text));

-- Counter table for GST invoice numbering per client per FY
CREATE TABLE IF NOT EXISTS gst_invoice_counters (
  client_id text NOT NULL,
  fy text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, fy)
);

-- RPC to generate next GST invoice number
CREATE OR REPLACE FUNCTION get_next_gst_invoice_number(cid text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fy text;
  next_num integer;
  prefix text;
BEGIN
  -- Financial year: Apr-Mar
  IF extract(month from current_date) >= 4 THEN
    v_fy := extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text;
  ELSE
    v_fy := (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text;
  END IF;

  -- Get prefix from client config
  SELECT config->>'quotePrefix' INTO prefix FROM clients WHERE id = cid;
  IF prefix IS NULL OR prefix = '' THEN
    prefix := upper(regexp_replace(cid, '[^a-zA-Z0-9]', '', 'g'));
  END IF;
  IF prefix = '' THEN prefix := 'JVUPVC'; END IF;

  -- Increment counter
  INSERT INTO gst_invoice_counters (client_id, fy, last_number)
  VALUES (cid, v_fy, 1)
  ON CONFLICT (client_id, fy)
  DO UPDATE SET last_number = gst_invoice_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN prefix || '/' || v_fy || '/' || lpad(next_num::text, 4, '0');
END;
$$;
