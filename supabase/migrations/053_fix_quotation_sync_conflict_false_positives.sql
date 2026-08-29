-- Migration: 053_fix_quotation_sync_conflict_false_positives.sql
-- Description: Prevent false-positive sync conflict errors when base_version is 0/null or uninitialized.

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

  SELECT COALESCE(sync_version, 1), last_operation_id
    INTO v_current_version, v_last_operation
  FROM public.quotations
  WHERE id = v_quote_id AND client_id = p_client_id
  FOR UPDATE;

  -- Idempotency check: if last operation matches, return saved
  IF FOUND AND v_last_operation = p_operation_id THEN
    UPDATE public.quotation_recovery_snapshots
      SET state = 'synced', updated_at = now()
    WHERE client_id = p_client_id AND operation_id = p_operation_id;
    RETURN jsonb_build_object(
      'status', 'saved', 'version', v_current_version,
      'operation_id', p_operation_id, 'idempotent', true
    );
  END IF;

  -- Conflict check: ONLY trigger conflict if base_version > 0 AND base_version <> current_version
  -- (When base_version is 0 or null, it represents initial local draft / reuse and is safely updated)
  IF FOUND AND COALESCE(p_base_version, 0) > 0 AND COALESCE(p_base_version, 0) <> v_current_version THEN
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
      p_client_id,
      v_next_version,
      p_operation_id
    );
  END IF;

  DELETE FROM public.measured_items WHERE quotation_id = v_quote_id AND client_id = p_client_id;
  IF jsonb_array_length(COALESCE(p_measured_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.measured_items (
      id, quotation_id, client_id, window_name, width, height, rate, quantity,
      mesh_type, track, remarks, profile_type, glass_type, openable_type,
      casing, unit, fixed_sash_width, sash_count
    )
    SELECT
      COALESCE(NULLIF(m->>'id', '')::uuid, gen_random_uuid()),
      v_quote_id,
      p_client_id,
      COALESCE(m->>'window_name', ''),
      COALESCE((m->>'width')::double precision, 0),
      COALESCE((m->>'height')::double precision, 0),
      COALESCE((m->>'rate')::double precision, 0),
      COALESCE((m->>'quantity')::integer, 1),
      COALESCE(m->>'mesh_type', ''),
      COALESCE(m->>'track', ''),
      COALESCE(m->>'remarks', ''),
      COALESCE(m->>'profile_type', ''),
      COALESCE(m->>'glass_type', ''),
      COALESCE(m->>'openable_type', ''),
      COALESCE((m->>'casing')::double precision, 0),
      COALESCE(m->>'unit', 'sqft'),
      COALESCE((m->>'fixed_sash_width')::double precision, 0),
      COALESCE((m->>'sash_count')::integer, 0)
    FROM jsonb_array_elements(p_measured_items) AS m;
  END IF;

  DELETE FROM public.unmeasured_items WHERE quotation_id = v_quote_id AND client_id = p_client_id;
  IF jsonb_array_length(COALESCE(p_unmeasured_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.unmeasured_items (
      id, quotation_id, client_id, item_name, rate, quantity
    )
    SELECT
      COALESCE(NULLIF(u->>'id', '')::uuid, gen_random_uuid()),
      v_quote_id,
      p_client_id,
      COALESCE(u->>'item_name', ''),
      COALESCE((u->>'rate')::double precision, 0),
      COALESCE((u->>'quantity')::integer, 1)
    FROM jsonb_array_elements(p_unmeasured_items) AS u;
  END IF;

  UPDATE public.quotation_recovery_snapshots
    SET state = 'synced', updated_at = now()
  WHERE client_id = p_client_id AND operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'saved',
    'version', v_next_version,
    'operation_id', p_operation_id
  );
END;
$$;
