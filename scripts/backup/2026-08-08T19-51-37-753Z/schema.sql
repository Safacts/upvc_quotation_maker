-- FULL BACKUP 2026-08-08T19-51-37-753Z
-- Tenant: effxrwrbsjduvhmorvrq
-- Host: aws-1-ap-south-1.pooler.supabase.com


-- Sequence: quotation_no_seq
CREATE SEQUENCE IF NOT EXISTS "public"."quotation_no_seq"
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9223372036854775807;
SELECT setval('"public"."quotation_no_seq"', 129, true);

-- Sequence: signup_requests_id_seq
CREATE SEQUENCE IF NOT EXISTS "public"."signup_requests_id_seq"
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9223372036854775807;
SELECT setval('"public"."signup_requests_id_seq"', 11, true);

CREATE TABLE IF NOT EXISTS "admins" (
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  CONSTRAINT "admins_pkey" PRIMARY KEY ("email")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "actor" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "clients" (
  "id" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trial_expires_at" timestamp with time zone,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "password_hash" text,
  "cost_margin_percent" numeric DEFAULT 65,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "phone" text DEFAULT ''::text NOT NULL,
  "email" text DEFAULT ''::text NOT NULL,
  "company" text DEFAULT ''::text NOT NULL,
  "address" text DEFAULT ''::text NOT NULL,
  "gst_number" text DEFAULT ''::text NOT NULL,
  "soft_deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "gst_invoice_counters" (
  "client_id" text NOT NULL,
  "fy" text NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "gst_invoice_counters_pkey" PRIMARY KEY ("client_id", "fy")
);

CREATE TABLE IF NOT EXISTS "gst_invoice_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid,
  "client_id" text NOT NULL,
  "sno" integer NOT NULL,
  "hsn_code" text DEFAULT '3925'::text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "quantity" numeric DEFAULT 1 NOT NULL,
  "unit" text DEFAULT 'SFT'::text NOT NULL,
  "rate" numeric DEFAULT 0 NOT NULL,
  "taxable_value" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "gst_invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gst_invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES "gst_invoices"("id")
);

CREATE TABLE IF NOT EXISTS "gst_invoices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "invoice_number" text NOT NULL,
  "invoice_date" date DEFAULT CURRENT_DATE NOT NULL,
  "supplier_company_name" text DEFAULT ''::text NOT NULL,
  "supplier_address" text DEFAULT ''::text NOT NULL,
  "supplier_gstin" text DEFAULT ''::text NOT NULL,
  "supplier_state" text DEFAULT 'Telangana'::text NOT NULL,
  "supplier_state_code" text DEFAULT '36'::text NOT NULL,
  "buyer_name" text DEFAULT ''::text NOT NULL,
  "buyer_address" text DEFAULT ''::text NOT NULL,
  "buyer_gstin" text DEFAULT ''::text NOT NULL,
  "buyer_state" text DEFAULT ''::text NOT NULL,
  "buyer_state_code" text DEFAULT ''::text NOT NULL,
  "place_of_supply" text DEFAULT 'Telangana'::text NOT NULL,
  "place_of_supply_code" text DEFAULT '36'::text NOT NULL,
  "is_interstate" boolean DEFAULT false NOT NULL,
  "is_reverse_charge" boolean DEFAULT false NOT NULL,
  "source_quotation_id" uuid,
  "transport_cost" numeric DEFAULT 0 NOT NULL,
  "subtotal" numeric DEFAULT 0 NOT NULL,
  "taxable_value" numeric DEFAULT 0 NOT NULL,
  "cgst_rate" numeric DEFAULT 9.0 NOT NULL,
  "sgst_rate" numeric DEFAULT 9.0 NOT NULL,
  "igst_rate" numeric DEFAULT 0.0 NOT NULL,
  "cgst_amount" numeric DEFAULT 0 NOT NULL,
  "sgst_amount" numeric DEFAULT 0 NOT NULL,
  "igst_amount" numeric DEFAULT 0 NOT NULL,
  "grand_total" numeric DEFAULT 0 NOT NULL,
  "amount_in_words" text DEFAULT ''::text NOT NULL,
  "notes" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "gst_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "measured_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "quotation_id" uuid NOT NULL,
  "code" text,
  "description" text,
  "width" numeric DEFAULT 0,
  "height" numeric DEFAULT 0,
  "units" integer DEFAULT 1,
  "glass" text,
  "rate" numeric DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  CONSTRAINT "measured_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "measured_items_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES "quotations"("id")
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "category" text DEFAULT ''::text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "price" numeric DEFAULT 0 NOT NULL,
  "unit" text DEFAULT 'SFT'::text NOT NULL,
  "soft_deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "quotation_counters" (
  "client_id" text NOT NULL,
  "next_val" bigint NOT NULL,
  CONSTRAINT "quotation_counters_pkey" PRIMARY KEY ("client_id")
);

CREATE TABLE IF NOT EXISTS "quotations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "quote_no" text NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "customer_name" text NOT NULL,
  "reference" text,
  "address" text,
  "contact_no" text,
  "transport_cost" numeric DEFAULT 0.0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text,
  "status" text DEFAULT 'draft'::text,
  "include_gst" boolean DEFAULT false,
  "gst_percentage" double precision DEFAULT 0.0,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  "supplier_company" text DEFAULT ''::text,
  "customer_id" uuid,
  "deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "quotations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quotations_quote_no_key" UNIQUE (quote_no),
  CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES "customers"("id")
);

CREATE TABLE IF NOT EXISTS "sent_emails" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  CONSTRAINT "sent_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_reviews" (
  "id" GENERATED ALWAYS AS IDENTITY NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  "customer_name" text NOT NULL,
  "role" text,
  "rating" integer NOT NULL,
  "review_text" text NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'market'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "quotation_no" text,
  CONSTRAINT "service_reviews_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));

CREATE TABLE IF NOT EXISTS "signup_requests" (
  "id" bigint DEFAULT nextval('signup_requests_id_seq'::regclass) NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "phone" text,
  "auth_method" text,
  "password_hash" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "signup_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "signup_requests_email_key" UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS "unmeasured_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "quotation_id" uuid NOT NULL,
  "description" text,
  "units" integer DEFAULT 1,
  "rate" numeric DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_id" text DEFAULT 'venkateshwara'::text NOT NULL,
  CONSTRAINT "unmeasured_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unmeasured_items_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES "quotations"("id")
);

CREATE TABLE IF NOT EXISTS "vitharn_invoice_counters" (
  "fy" text NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "vitharn_invoice_counters_pkey" PRIMARY KEY ("fy")
);

CREATE TABLE IF NOT EXISTS "vitharn_invoice_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "sno" integer DEFAULT 1 NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "details" text DEFAULT ''::text NOT NULL,
  "qty" numeric DEFAULT 1 NOT NULL,
  "amount" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vitharn_invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vitharn_invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES "vitharn_invoices"("id")
);

CREATE TABLE IF NOT EXISTS "vitharn_invoices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" text NOT NULL,
  "invoice_date" date DEFAULT CURRENT_DATE NOT NULL,
  "due_date" date,
  "payment_terms" text DEFAULT 'Due on receipt'::text NOT NULL,
  "client_id" text,
  "client_name" text DEFAULT ''::text NOT NULL,
  "client_company" text DEFAULT ''::text NOT NULL,
  "client_address" text DEFAULT ''::text NOT NULL,
  "client_email" text DEFAULT ''::text NOT NULL,
  "client_phone" text DEFAULT ''::text NOT NULL,
  "subtotal" numeric DEFAULT 0 NOT NULL,
  "gst_rate" numeric DEFAULT 0 NOT NULL,
  "gst_amount" numeric DEFAULT 0 NOT NULL,
  "total" numeric DEFAULT 0 NOT NULL,
  "notes" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "paid_on" date,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vitharn_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vitharn_invoices_invoice_number_key" UNIQUE (invoice_number)
);

CREATE INDEX audit_logs_client_created_idx ON public.audit_logs USING btree (client_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (client_id, entity_type, entity_id, created_at DESC);
CREATE INDEX customers_client_live_idx ON public.customers USING btree (client_id) WHERE (soft_deleted = false);
CREATE UNIQUE INDEX customers_live_phone_uniq ON public.customers USING btree (client_id, phone) WHERE ((phone <> ''::text) AND (soft_deleted = false));
CREATE INDEX customers_name_trgm_idx ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX idx_customers_client_id ON public.customers USING btree (client_id);
CREATE INDEX idx_customers_name ON public.customers USING btree (name);
CREATE INDEX idx_customers_soft_deleted ON public.customers USING btree (soft_deleted);
CREATE INDEX idx_gst_invoice_items_invoice_id ON public.gst_invoice_items USING btree (invoice_id);
CREATE INDEX idx_gst_invoices_client_id ON public.gst_invoices USING btree (client_id);
CREATE INDEX idx_gst_invoices_invoice_number ON public.gst_invoices USING btree (invoice_number);
CREATE INDEX idx_measured_items_client ON public.measured_items USING btree (client_id);
CREATE INDEX idx_products_category ON public.products USING btree (category);
CREATE INDEX idx_products_client_id ON public.products USING btree (client_id);
CREATE INDEX idx_products_name ON public.products USING btree (name);
CREATE INDEX idx_products_soft_deleted ON public.products USING btree (soft_deleted);
CREATE INDEX products_category_trgm_idx ON public.products USING gin (category gin_trgm_ops);
CREATE INDEX products_client_live_idx ON public.products USING btree (client_id) WHERE (soft_deleted = false);
CREATE INDEX products_name_trgm_idx ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX idx_quotations_client ON public.quotations USING btree (client_id);
CREATE INDEX quotations_client_contact_idx ON public.quotations USING btree (client_id, contact_no);
CREATE INDEX quotations_client_created_idx ON public.quotations USING btree (client_id, created_at DESC);
CREATE INDEX quotations_client_customer_idx ON public.quotations USING btree (client_id, customer_id);
CREATE INDEX quotations_client_live_idx ON public.quotations USING btree (client_id) WHERE (deleted = false);
CREATE INDEX quotations_client_status_idx ON public.quotations USING btree (client_id, lower(status));
CREATE INDEX quotations_customer_name_trgm_idx ON public.quotations USING gin (customer_name gin_trgm_ops);
CREATE INDEX idx_sent_emails_client ON public.sent_emails USING btree (client_id);
CREATE INDEX service_reviews_client_created_idx ON public.service_reviews USING btree (client_id, is_visible, created_at DESC);
CREATE UNIQUE INDEX service_reviews_client_quote_uidx ON public.service_reviews USING btree (client_id, quotation_no) WHERE (quotation_no IS NOT NULL);
CREATE INDEX idx_signup_requests_email ON public.signup_requests USING btree (email);
CREATE INDEX idx_unmeasured_items_client ON public.unmeasured_items USING btree (client_id);
CREATE INDEX idx_vitharn_invoice_items_inv ON public.vitharn_invoice_items USING btree (invoice_id);
CREATE INDEX idx_vitharn_invoices_client_id ON public.vitharn_invoices USING btree (client_id);
CREATE INDEX idx_vitharn_invoices_status ON public.vitharn_invoices USING btree (status);

-- View: client_public
CREATE OR REPLACE VIEW "client_public" AS
 SELECT id,
    (config - 'portalPasswordHash'::text) AS config,
    trial_expires_at,
    is_active,
    created_at,
    updated_at,
    cost_margin_percent
   FROM clients
  WHERE (is_active = true);;

-- View: quotation_money
CREATE OR REPLACE VIEW "quotation_money" AS
 SELECT q.id,
    q.client_id,
    q.quote_no,
    q.customer_name,
    q.contact_no,
    q.customer_id,
    q.deleted,
    lower(btrim(COALESCE(q.status, 'draft'::text))) AS status,
    q.created_at,
    q.date,
    q.reference,
    q.supplier_company,
    q.include_gst,
    COALESCE(q.gst_percentage, (0)::double precision) AS gst_percentage_raw,
    COALESCE(m.total_measured, (0)::double precision) AS total_measured,
    COALESCE(u.total_unmeasured, (0)::double precision) AS total_unmeasured,
    COALESCE(m.total_sqft, (0)::double precision) AS total_sqft,
    (COALESCE(q.transport_cost, (0)::numeric))::double precision AS transport,
    (COALESCE(m.total_measured, (0)::double precision) + COALESCE(u.total_unmeasured, (0)::double precision)) AS subtotal,
    ((COALESCE(m.total_measured, (0)::double precision) + COALESCE(u.total_unmeasured, (0)::double precision)) + (COALESCE(q.transport_cost, (0)::numeric))::double precision) AS net_total,
        CASE
            WHEN q.include_gst THEN COALESCE(q.gst_percentage, (0)::double precision)
            ELSE (0)::double precision
        END AS gst_percentage,
    (((COALESCE(m.total_measured, (0)::double precision) + COALESCE(u.total_unmeasured, (0)::double precision)) + (COALESCE(q.transport_cost, (0)::numeric))::double precision) * (
        CASE
            WHEN q.include_gst THEN COALESCE(q.gst_percentage, (0)::double precision)
            ELSE (0)::double precision
        END / (100)::double precision)) AS gst_amount,
    (((COALESCE(m.total_measured, (0)::double precision) + COALESCE(u.total_unmeasured, (0)::double precision)) + (COALESCE(q.transport_cost, (0)::numeric))::double precision) + (((COALESCE(m.total_measured, (0)::double precision) + COALESCE(u.total_unmeasured, (0)::double precision)) + (COALESCE(q.transport_cost, (0)::numeric))::double precision) * (
        CASE
            WHEN q.include_gst THEN COALESCE(q.gst_percentage, (0)::double precision)
            ELSE (0)::double precision
        END / (100)::double precision))) AS grand_total
   FROM ((quotations q
     LEFT JOIN LATERAL ( SELECT sum((((((COALESCE(mi.width, (0)::numeric))::double precision / (304.8)::double precision) * ((COALESCE(mi.height, (0)::numeric))::double precision / (304.8)::double precision)) * (COALESCE(mi.units, 1))::double precision) * (COALESCE(mi.rate, (0)::numeric))::double precision)) AS total_measured,
            sum(((((COALESCE(mi.width, (0)::numeric))::double precision / (304.8)::double precision) * ((COALESCE(mi.height, (0)::numeric))::double precision / (304.8)::double precision)) * (COALESCE(mi.units, 1))::double precision)) AS total_sqft
           FROM measured_items mi
          WHERE (mi.quotation_id = q.id)) m ON (true))
     LEFT JOIN LATERAL ( SELECT sum(((COALESCE(ui.units, 1))::double precision * (COALESCE(ui.rate, (0)::numeric))::double precision)) AS total_unmeasured
           FROM unmeasured_items ui
          WHERE (ui.quotation_id = q.id)) u ON (true));;

-- Function: bulk_delete
CREATE OR REPLACE FUNCTION public.bulk_delete(p_cid text, p_ids uuid[])
 RETURNS TABLE(quotation_id uuid, success boolean, message text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: bulk_status_update
CREATE OR REPLACE FUNCTION public.bulk_status_update(p_cid text, p_ids uuid[], p_new_status text)
 RETURNS TABLE(quotation_id uuid, success boolean, message text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: get_next_gst_invoice_number
CREATE OR REPLACE FUNCTION public.get_next_gst_invoice_number(cid text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fy text;
  next_num integer;
  prefix text;
BEGIN
  IF extract(month from current_date) >= 4 THEN
    v_fy := extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text;
  ELSE
    v_fy := (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text;
  END IF;

  SELECT config->>'quotePrefix' INTO prefix FROM clients WHERE id = cid;
  IF prefix IS NULL OR prefix = '' THEN
    prefix := upper(regexp_replace(cid, '[^a-zA-Z0-9]', '', 'g'));
  END IF;
  IF prefix = '' THEN prefix := 'JVUPVC'; END IF;

  INSERT INTO gst_invoice_counters (client_id, fy, last_number)
  VALUES (cid, v_fy, 1)
  ON CONFLICT (client_id, fy)
  DO UPDATE SET last_number = gst_invoice_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN prefix || '/' || v_fy || '/' || lpad(next_num::text, 4, '0');
END;
$function$
;

-- Function: get_next_quote_number
CREATE OR REPLACE FUNCTION public.get_next_quote_number()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    next_val INT;
    date_part TEXT;
BEGIN
    next_val := nextval('quotation_no_seq');
    date_part := to_char(CURRENT_DATE, 'DDMMYYYY');
    RETURN 'JVUPVC-' || date_part || '-' || lpad(next_val::text, 4, '0');
END;
$function$
;

-- Function: get_next_quote_number
CREATE OR REPLACE FUNCTION public.get_next_quote_number(cid text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
        v_next BIGINT;
        v_date TEXT;
        v_prefix TEXT;
    BEGIN
        INSERT INTO public.quotation_counters(client_id, next_val)
        VALUES (cid, 1)
        ON CONFLICT (client_id)
        DO UPDATE SET next_val = public.quotation_counters.next_val + 1
        RETURNING next_val INTO v_next;

        SELECT config->>'quotePrefix' INTO v_prefix FROM public.clients WHERE id = cid;
        IF v_prefix IS NULL OR v_prefix = '' THEN
            v_prefix := upper(regexp_replace(cid, '[^a-zA-Z0-9]', '', 'g'));
        END IF;
        IF v_prefix = '' THEN v_prefix := 'JVUPVC'; END IF;

        v_date := to_char(CURRENT_DATE, 'DDMMYYYY');
        RETURN v_prefix || '-' || v_date || '-' || lpad(v_next::text, 4, '0');
    END;
    $function$
;

-- Function: get_next_vitharn_invoice_number
CREATE OR REPLACE FUNCTION public.get_next_vitharn_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
      DECLARE
        v_fy     text;
        next_num integer;
      BEGIN
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
      $function$
;

-- Function: get_quote_stats
CREATE OR REPLACE FUNCTION public.get_quote_stats(p_cid text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total_count bigint, draft_count bigint, sent_count bigint, won_count bigint, lost_count bigint, total_quoted numeric, won_quoted numeric, total_grand numeric, won_grand numeric, total_gst numeric, total_transport numeric, total_sqft numeric, win_rate numeric, avg_quote_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: gin_extract_query_trgm
CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

-- Function: gin_extract_value_trgm
CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

-- Function: gin_trgm_consistent
CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

-- Function: gin_trgm_triconsistent
CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

-- Function: gst_summary
CREATE OR REPLACE FUNCTION public.gst_summary(p_cid text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(period text, num_quotes bigint, taxable_value numeric, gst_amount numeric, total_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: gtrgm_compress
CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

-- Function: gtrgm_consistent
CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

-- Function: gtrgm_decompress
CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

-- Function: gtrgm_distance
CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

-- Function: gtrgm_in
CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

-- Function: gtrgm_options
CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

-- Function: gtrgm_out
CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

-- Function: gtrgm_penalty
CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

-- Function: gtrgm_picksplit
CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

-- Function: gtrgm_same
CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

-- Function: gtrgm_union
CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

-- Function: product_movement
CREATE OR REPLACE FUNCTION public.product_movement(p_cid text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(item_type text, description text, code text, total_qty numeric, total_sqft numeric, total_amount numeric, num_quotes bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: search_quotations
CREATE OR REPLACE FUNCTION public.search_quotations(p_cid text, p_q text DEFAULT NULL::text, p_status text[] DEFAULT ARRAY['draft'::text, 'sent'::text, 'won'::text, 'lost'::text], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_customer_id uuid DEFAULT NULL::uuid, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(id uuid, quote_no text, customer_name text, contact_no text, customer_id uuid, status text, created_at timestamp with time zone, quote_date date, reference text, total_sqft numeric, subtotal numeric, transport numeric, net_total numeric, gst_percentage numeric, gst_amount numeric, grand_total numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: set_limit
CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

-- Function: show_limit
CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

-- Function: show_trgm
CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

-- Function: similarity
CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

-- Function: similarity_dist
CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

-- Function: similarity_op
CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

-- Function: strict_word_similarity
CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

-- Function: strict_word_similarity_commutator_op
CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

-- Function: strict_word_similarity_dist_commutator_op
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

-- Function: strict_word_similarity_dist_op
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

-- Function: strict_word_similarity_op
CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

-- Function: tally_export_data
CREATE OR REPLACE FUNCTION public.tally_export_data(p_cid text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text[] DEFAULT ARRAY['sent'::text, 'won'::text])
 RETURNS TABLE(quotation_id uuid, quote_no text, voucher_date date, customer_name text, customer_gstin text, customer_address text, reference text, supplier_company text, subtotal numeric, transport numeric, net_total numeric, gst_rate numeric, gst_amount numeric, grand_total numeric, line_items jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: tr_send_email_via_brevo
CREATE OR REPLACE FUNCTION public.tr_send_email_via_brevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
      PERFORM net.http_post(
        url := 'https://api.brevo.com/v3/smtp/email',
        headers := jsonb_build_object(
          'accept', 'application/json',
          'api-key', 'xsmtpsib-c7da6236a6bac47309267b245813ccb7675d526c02236bcdf8666d5adff1c2f8-8p8el8xB45QYLXOw',
          'content-type', 'application/json'
        ),
        body := jsonb_build_object(
          'sender', jsonb_build_object('name', 'System Security', 'email', 'jvenkateshupvc@gmail.com'),
          'to', jsonb_build_array(jsonb_build_object('email', NEW.recipient)),
          'subject', NEW.subject,
          'htmlContent', NEW.body
        )
      );
      RETURN NEW;
    END;
    $function$
;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

-- Function: win_loss_report
CREATE OR REPLACE FUNCTION public.win_loss_report(p_cid text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(status text, count bigint, total_value numeric, grand_total numeric, pct_of_total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Function: word_similarity
CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

-- Function: word_similarity_commutator_op
CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

-- Function: word_similarity_dist_commutator_op
CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

-- Function: word_similarity_dist_op
CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

-- Function: word_similarity_op
CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

-- Policy: Enable read access for all users ON admins
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON "admins" AS PERMISSIVE FOR SELECT TO {public} USING (true);

-- Policy: Enable update access for all users ON admins
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable update access for all users" ON "admins" AS PERMISSIVE FOR UPDATE TO {public} USING (true) WITH CHECK (true);

-- Policy: service_role full access admins ON admins
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role full access admins" ON "admins" AS PERMISSIVE FOR ALL TO {service_role} USING (true) WITH CHECK (true);

-- Policy: Allow public all on audit_logs ON audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all on audit_logs" ON "audit_logs" AS PERMISSIVE FOR ALL TO {public} USING (true) WITH CHECK (true);

-- Policy: Allow service_role full access on audit_logs ON audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on audit_logs" ON "audit_logs" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation_audit_logs ON audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation_audit_logs" ON "audit_logs" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: Allow admin full access ON clients
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admin full access" ON "clients" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: Allow public read active clients ON clients
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read active clients" ON "clients" AS PERMISSIVE FOR SELECT TO {public} USING ((is_active = true));

-- Policy: Allow public all on customers ON customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all on customers" ON "customers" AS PERMISSIVE FOR ALL TO {public} USING (true) WITH CHECK (true);

-- Policy: Allow service_role full access on customers ON customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on customers" ON "customers" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation_customers ON customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation_customers" ON "customers" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: tenant_isolation_gst_invoice_items ON gst_invoice_items
ALTER TABLE "gst_invoice_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_gst_invoice_items" ON "gst_invoice_items" AS PERMISSIVE FOR ALL TO {public} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: tenant_isolation_gst_invoices ON gst_invoices
ALTER TABLE "gst_invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_gst_invoices" ON "gst_invoices" AS PERMISSIVE FOR ALL TO {public} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: Allow service_role full access on measured_items ON measured_items
ALTER TABLE "measured_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on measured_items" ON "measured_items" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation ON measured_items
ALTER TABLE "measured_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON "measured_items" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: Allow public all on products ON products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all on products" ON "products" AS PERMISSIVE FOR ALL TO {public} USING (true) WITH CHECK (true);

-- Policy: Allow service_role full access on products ON products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on products" ON "products" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation_products ON products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation_products" ON "products" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: Allow service_role full access on quotations ON quotations
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on quotations" ON "quotations" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation ON quotations
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON "quotations" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: client_isolation ON sent_emails
ALTER TABLE "sent_emails" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON "sent_emails" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

-- Policy: service_reviews_insert_public ON service_reviews
ALTER TABLE "service_reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_reviews_insert_public" ON "service_reviews" AS PERMISSIVE FOR INSERT TO {anon,authenticated} WITH CHECK ((((rating >= 1) AND (rating <= 5)) AND ((char_length(customer_name) >= 1) AND (char_length(customer_name) <= 100)) AND ((char_length(review_text) >= 1) AND (char_length(review_text) <= 1000))));

-- Policy: service_reviews_select_public ON service_reviews
ALTER TABLE "service_reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_reviews_select_public" ON "service_reviews" AS PERMISSIVE FOR SELECT TO {anon,authenticated} USING ((is_visible = true));

-- Policy: Allow service_role full access on unmeasured_items ON unmeasured_items
ALTER TABLE "unmeasured_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service_role full access on unmeasured_items" ON "unmeasured_items" AS PERMISSIVE FOR ALL TO {public} USING ((auth.role() = 'service_role'::text));

-- Policy: client_isolation ON unmeasured_items
ALTER TABLE "unmeasured_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON "unmeasured_items" AS PERMISSIVE FOR ALL TO {anon,authenticated} USING ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text))) WITH CHECK ((client_id = ((current_setting('request.headers'::text, true))::json ->> 'x-client-id'::text)));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "admins" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "audit_logs" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "audit_logs" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "audit_logs" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "client_public" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "client_public" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "client_public" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "clients" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "customers" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "customers" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "customers" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_counters" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_counters" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_counters" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_items" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_items" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoice_items" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoices" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoices" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "gst_invoices" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "measured_items" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "measured_items" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "measured_items" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "products" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "products" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "products" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_counters" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_counters" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_counters" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_money" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_money" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotation_money" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotations" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotations" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "quotations" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "sent_emails" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "service_reviews" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "service_reviews" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "service_reviews" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "signup_requests" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "unmeasured_items" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "unmeasured_items" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "unmeasured_items" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "vitharn_invoice_counters" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "vitharn_invoice_items" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "vitharn_invoices" TO service_role;

SET session_replication_role = DEFAULT;