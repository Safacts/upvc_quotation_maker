-- Atomic, idempotent quotation saves plus a separate recovery vault.
-- The recovery row is written before conflict detection so an interrupted or
-- conflicting save can always be inspected and recovered without overwriting
-- the canonical quotation.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS sync_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_operation_id uuid;

CREATE TABLE IF NOT EXISTS public.quotation_recovery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  quotation_id uuid NOT NULL,
  device_id text NOT NULL,
  operation_id uuid NOT NULL,
  base_version bigint NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  checksum text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'synced', 'conflict', 'restored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, operation_id)
);

CREATE INDEX IF NOT EXISTS quotation_recovery_client_created_idx
  ON public.quotation_recovery_snapshots (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quotation_recovery_quote_created_idx
  ON public.quotation_recovery_snapshots
  (client_id, quotation_id, created_at DESC);

ALTER TABLE public.quotation_recovery_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_isolation_quotation_recovery" ON public.quotation_recovery_snapshots;
CREATE POLICY "client_isolation_quotation_recovery"
  ON public.quotation_recovery_snapshots
  FOR ALL
  TO anon, authenticated
  USING (
    client_id = current_setting('request.headers', true)::json->>'x-client-id'
  )
  WITH CHECK (
    client_id = current_setting('request.headers', true)::json->>'x-client-id'
  );

DROP POLICY IF EXISTS "service_role_quotation_recovery" ON public.quotation_recovery_snapshots;
CREATE POLICY "service_role_quotation_recovery"
  ON public.quotation_recovery_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.save_quotation_bundle_v1(
  p_client_id text,
  p_device_id text,
  p_operation_id uuid,
  p_base_version bigint,
  p_checksum text,
  p_quotation jsonb,
  p_measured_items jsonb DEFAULT '[]'::jsonb,
  p_unmeasured_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_header_client text;
  v_quote_id uuid;
  v_current_version bigint;
  v_last_operation uuid;
  v_next_version bigint;
  v_snapshot jsonb;
BEGIN
  v_header_client := current_setting('request.headers', true)::json->>'x-client-id';
  IF p_client_id IS NULL OR btrim(p_client_id) = '' OR v_header_client IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'client identity mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'device id is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_measured_items, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_unmeasured_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'quotation item payload must be arrays' USING ERRCODE = '22023';
  END IF;

  v_quote_id := NULLIF(p_quotation->>'id', '')::uuid;
  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'quotation id is required' USING ERRCODE = '22023';
  END IF;

  v_snapshot := jsonb_build_object(
    'quotation', p_quotation,
    'measured_items', COALESCE(p_measured_items, '[]'::jsonb),
    'unmeasured_items', COALESCE(p_unmeasured_items, '[]'::jsonb)
  );

  INSERT INTO public.quotation_recovery_snapshots (
    client_id, quotation_id, device_id, operation_id, base_version,
    snapshot, checksum, state
  ) VALUES (
    p_client_id, v_quote_id, p_device_id, p_operation_id,
    GREATEST(COALESCE(p_base_version, 0), 0), v_snapshot, p_checksum, 'pending'
  )
  ON CONFLICT (client_id, operation_id) DO NOTHING;

  SELECT sync_version, last_operation_id
    INTO v_current_version, v_last_operation
  FROM public.quotations
  WHERE id = v_quote_id AND client_id = p_client_id
  FOR UPDATE;

  IF FOUND AND v_last_operation = p_operation_id THEN
    UPDATE public.quotation_recovery_snapshots
      SET state = 'synced', updated_at = now()
    WHERE client_id = p_client_id AND operation_id = p_operation_id;
    RETURN jsonb_build_object(
      'status', 'saved', 'version', v_current_version,
      'operation_id', p_operation_id, 'idempotent', true
    );
  END IF;

  IF FOUND AND COALESCE(p_base_version, 0) <> v_current_version THEN
    UPDATE public.quotation_recovery_snapshots
      SET state = 'conflict', updated_at = now()
    WHERE client_id = p_client_id AND operation_id = p_operation_id;
    RETURN jsonb_build_object(
      'status', 'conflict',
      'version', v_current_version,
      'operation_id', p_operation_id,
      'server_quotation', (
        SELECT to_jsonb(q) FROM public.quotations q
        WHERE q.id = v_quote_id AND q.client_id = p_client_id
      )
    );
  END IF;

  IF FOUND THEN
    v_next_version := v_current_version + 1;
    UPDATE public.quotations SET
      quote_no = COALESCE(NULLIF(p_quotation->>'quote_no', ''), quote_no),
      date = COALESCE(NULLIF(p_quotation->>'date', '')::date, date),
      customer_name = COALESCE(p_quotation->>'customer_name', ''),
      reference = COALESCE(p_quotation->>'reference', ''),
      address = COALESCE(p_quotation->>'address', ''),
      contact_no = COALESCE(p_quotation->>'contact_no', ''),
      email = COALESCE(p_quotation->>'email', ''),
      transport_cost = COALESCE((p_quotation->>'transport_cost')::numeric, 0),
      advance_paid = COALESCE((p_quotation->>'advance_paid')::numeric, 0),
      include_gst = COALESCE((p_quotation->>'include_gst')::boolean, false),
      gst_percentage = COALESCE((p_quotation->>'gst_percentage')::double precision, 0),
      status = COALESCE(NULLIF(p_quotation->>'status', ''), status),
      supplier_company = COALESCE(p_quotation->>'supplier_company', ''),
      sync_version = v_next_version,
      last_operation_id = p_operation_id
    WHERE id = v_quote_id AND client_id = p_client_id;
  ELSE
    v_next_version := 1;
    INSERT INTO public.quotations (
      id, quote_no, date, customer_name, reference, address, contact_no,
      email, transport_cost, advance_paid, include_gst, gst_percentage,
      status, supplier_company, client_id, sync_version, last_operation_id
    ) VALUES (
      v_quote_id,
      COALESCE(NULLIF(p_quotation->>'quote_no', ''), 'DRAFT-' || left(v_quote_id::text, 8)),
      COALESCE(NULLIF(p_quotation->>'date', '')::date, CURRENT_DATE),
      COALESCE(p_quotation->>'customer_name', ''),
      COALESCE(p_quotation->>'reference', ''),
      COALESCE(p_quotation->>'address', ''),
      COALESCE(p_quotation->>'contact_no', ''),
      COALESCE(p_quotation->>'email', ''),
      COALESCE((p_quotation->>'transport_cost')::numeric, 0),
      COALESCE((p_quotation->>'advance_paid')::numeric, 0),
      COALESCE((p_quotation->>'include_gst')::boolean, false),
      COALESCE((p_quotation->>'gst_percentage')::double precision, 0),
      COALESCE(NULLIF(p_quotation->>'status', ''), 'draft'),
      COALESCE(p_quotation->>'supplier_company', ''),
      p_client_id, v_next_version, p_operation_id
    );
  END IF;

  DELETE FROM public.measured_items
    WHERE quotation_id = v_quote_id AND client_id = p_client_id;
  INSERT INTO public.measured_items (
    id, quotation_id, client_id, code, description, width, height,
    units, glass, rate, bom_config
  )
  SELECT
    COALESCE(x.id, gen_random_uuid()), v_quote_id, p_client_id,
    COALESCE(x.code, ''), COALESCE(x.description, ''),
    COALESCE(x.width, 0), COALESCE(x.height, 0), COALESCE(x.units, 1),
    COALESCE(x.glass, ''), COALESCE(x.rate, 0), COALESCE(x.bom_config, '{}'::jsonb)
  FROM jsonb_to_recordset(COALESCE(p_measured_items, '[]'::jsonb)) AS x(
    id uuid, quotation_id uuid, client_id text, code text, description text,
    width numeric, height numeric, units integer, glass text, rate numeric,
    bom_config jsonb
  );

  DELETE FROM public.unmeasured_items
    WHERE quotation_id = v_quote_id AND client_id = p_client_id;
  INSERT INTO public.unmeasured_items (
    id, quotation_id, client_id, description, units, rate
  )
  SELECT
    COALESCE(x.id, gen_random_uuid()), v_quote_id, p_client_id,
    COALESCE(x.description, ''), COALESCE(x.units, 1), COALESCE(x.rate, 0)
  FROM jsonb_to_recordset(COALESCE(p_unmeasured_items, '[]'::jsonb)) AS x(
    id uuid, quotation_id uuid, client_id text, description text,
    units integer, rate numeric
  );

  UPDATE public.quotation_recovery_snapshots
    SET state = 'synced', updated_at = now()
  WHERE client_id = p_client_id AND operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'saved', 'version', v_next_version,
    'operation_id', p_operation_id, 'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_bundle_v1(
  text, text, uuid, bigint, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_bundle_v1(
  text, text, uuid, bigint, text, jsonb, jsonb, jsonb
) TO anon, authenticated, service_role;

COMMENT ON TABLE public.quotation_recovery_snapshots IS
  'Append-only recovery copies for interrupted, offline, or conflicting quotation saves.';
COMMENT ON FUNCTION public.save_quotation_bundle_v1 IS
  'Atomically saves quotation plus items with operation idempotency and optimistic version checks.';

NOTIFY pgrst, 'reload schema';
