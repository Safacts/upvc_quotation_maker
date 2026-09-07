-- 057_fix_instant_upvc_duplicate.sql
-- Fix duplicate INSTANT UPVC clients: keep slug 'instant-upvc-windows-and-doors', migrate data from 'INSTANT UPVC WINDOWS & DOORS'

DO $$
BEGIN
  -- Migrate all tenant tables from duplicate to correct slug (idempotent)
  -- Quotations + items
  UPDATE public.quotations SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.measured_items SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.unmeasured_items SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.customers SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.products SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.client_config_dynamic SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  -- Eva foundation tables
  UPDATE public.price_structures SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.profile_catalog SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.offcut_inventory SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  UPDATE public.project_openings SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  -- Other tenant tables (no-op if column missing, guarded via exception)
  BEGIN
    UPDATE public.orders SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    UPDATE public.leads SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.projects SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.parties SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.payments SET client_id = 'instant-upvc-windows-and-doors' WHERE client_id = 'INSTANT UPVC WINDOWS & DOORS';
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;
  -- quotation_revisions and project_openings have FK to quotations, but client_id is direct
  -- Handle quotation_revisions via quotations FK (no direct client_id, but snapshot has client)
  -- Delete duplicate client row (keep correct slug)
  DELETE FROM public.clients WHERE id = 'INSTANT UPVC WINDOWS & DOORS' AND EXISTS (SELECT 1 FROM public.clients WHERE id = 'instant-upvc-windows-and-doors');
END $$;
