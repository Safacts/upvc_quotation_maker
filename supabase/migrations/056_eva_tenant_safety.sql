-- 056_eva_tenant_safety.sql
-- Tenant isolation and integrity hardening for Eva foundation tables.

ALTER TABLE public.price_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offcut_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_openings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_structures, public.price_elements,
  public.profile_catalog, public.offcut_inventory, public.quotation_revisions,
  public.project_openings TO anon, authenticated, service_role;

DROP POLICY IF EXISTS price_structures_tenant ON public.price_structures;
CREATE POLICY price_structures_tenant ON public.price_structures FOR ALL USING
  (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

DROP POLICY IF EXISTS price_elements_tenant ON public.price_elements;
CREATE POLICY price_elements_tenant ON public.price_elements FOR ALL USING
  (EXISTS (SELECT 1 FROM public.price_structures s WHERE s.id = structure_id
    AND s.client_id = current_setting('request.headers', true)::json->>'x-client-id'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.price_structures s WHERE s.id = structure_id
    AND s.client_id = current_setting('request.headers', true)::json->>'x-client-id'));

DROP POLICY IF EXISTS profile_catalog_tenant ON public.profile_catalog;
CREATE POLICY profile_catalog_tenant ON public.profile_catalog FOR ALL USING
  (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

DROP POLICY IF EXISTS offcut_inventory_tenant ON public.offcut_inventory;
CREATE POLICY offcut_inventory_tenant ON public.offcut_inventory FOR ALL USING
  (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

DROP POLICY IF EXISTS quotation_revisions_tenant ON public.quotation_revisions;
CREATE POLICY quotation_revisions_tenant ON public.quotation_revisions FOR ALL USING
  (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id
    AND q.client_id = current_setting('request.headers', true)::json->>'x-client-id'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id
    AND q.client_id = current_setting('request.headers', true)::json->>'x-client-id'));

DROP POLICY IF EXISTS project_openings_tenant ON public.project_openings;
CREATE POLICY project_openings_tenant ON public.project_openings FOR ALL USING
  (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

CREATE UNIQUE INDEX IF NOT EXISTS price_structures_one_default_per_client
  ON public.price_structures(client_id) WHERE is_default;
ALTER TABLE public.offcut_inventory
  ADD CONSTRAINT offcut_inventory_stock_positive CHECK (stock_mm > 0);

CREATE OR REPLACE FUNCTION public.validate_project_opening_quotation_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.quotation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = NEW.quotation_id AND q.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'quotation does not belong to opening tenant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS project_openings_quotation_tenant ON public.project_openings;
CREATE TRIGGER project_openings_quotation_tenant
  BEFORE INSERT OR UPDATE ON public.project_openings
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_opening_quotation_tenant();
