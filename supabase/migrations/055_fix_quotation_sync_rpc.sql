-- Migration: 055_fix_quotation_sync_rpc.sql
-- Description: Restore the live item-column contract and fail closed for stale zero-version updates.
-- This migration supersedes the function body introduced by migration 053.

ALTER TABLE public.quotation_recovery_snapshots
  ADD COLUMN IF NOT EXISTS result jsonb;

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
  v_existing_quotation uuid;
  v_existing_checksum text;
  v_existing_state text;
  v_result jsonb;
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

  SELECT quotation_id, checksum, state, result
    INTO v_existing_quotation, v_existing_checksum, v_existing_state, v_result
  FROM public.quotation_recovery_snapshots
  WHERE client_id = p_client_id AND operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing_quotation IS DISTINCT FROM v_quote_id
       OR v_existing_checksum IS DISTINCT FROM p_checksum THEN
      RAISE EXCEPTION 'operation id was reused with a different quotation or checksum'
        USING ERRCODE = '23505';
    END IF;
    IF v_existing_state IN ('synced', 'conflict') AND v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  INSERT INTO public.quotation_recovery_snapshots (
    client_id, quotation_id, device_id, operation_id, base_version,
    snapshot, checksum, state
  ) VALUES (
    p_client_id, v_quote_id, p_device_id, p_operation_id,
    GREATEST(COALESCE(p_base_version, 0), 0), v_snapshot, p_checksum, 'pending'
  )
  ON CONFLICT (client_id, operation_id) DO NOTHING;

  SELECT COALESCE(sync_version, 1), last_operation_id
    INTO v_current_version, v_last_operation
  FROM public.quotations
  WHERE id = v_quote_id AND client_id = p_client_id
  FOR UPDATE;

  -- Idempotency check: if last operation matches, return saved
  IF FOUND AND v_last_operation = p_operation_id THEN
    v_result := jsonb_build_object(
      'status', 'saved', 'version', v_current_version,
      'operation_id', p_operation_id, 'idempotent', true
    );
    UPDATE public.quotation_recovery_snapshots
      SET state = 'synced', result = v_result, updated_at = now()
    WHERE client_id = p_client_id AND operation_id = p_operation_id;
    RETURN v_result;
  END IF;

  -- A zero version is valid only for a genuinely uninitialized existing row.
  -- Once a row has a version greater than 1, or any recorded operation, a zero-version
  -- payload is stale and must not overwrite newer server data.
  IF FOUND AND (
    (COALESCE(p_base_version, 0) <= 0
      AND (v_current_version > 1 OR v_last_operation IS NOT NULL))
    OR
    (COALESCE(p_base_version, 0) > 0
      AND COALESCE(p_base_version, 0) <> v_current_version)
  ) THEN
    v_result := jsonb_build_object(
      'status', 'conflict',
      'version', v_current_version,
      'operation_id', p_operation_id,
      'server_quotation', (
        SELECT to_jsonb(q) FROM public.quotations q
        WHERE q.id = v_quote_id AND q.client_id = p_client_id
      )
    );
    UPDATE public.quotation_recovery_snapshots
      SET state = 'conflict', result = v_result, updated_at = now()
    WHERE client_id = p_client_id AND operation_id = p_operation_id;
    RETURN v_result;
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
      p_client_id,
      v_next_version,
      p_operation_id
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
    COALESCE(x.glass, ''), COALESCE(x.rate, 0),
    COALESCE(x.bom_config, '{}'::jsonb)
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

  v_result := jsonb_build_object(
    'status', 'saved',
    'version', v_next_version,
    'operation_id', p_operation_id,
    'idempotent', false
  );
  UPDATE public.quotation_recovery_snapshots
    SET state = 'synced', result = v_result, updated_at = now()
  WHERE client_id = p_client_id AND operation_id = p_operation_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_bundle_v1(
  text, text, uuid, bigint, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_bundle_v1(
  text, text, uuid, bigint, text, jsonb, jsonb, jsonb
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
