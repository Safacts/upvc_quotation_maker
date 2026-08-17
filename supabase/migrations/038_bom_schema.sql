-- Migration 038: manufacturing BOM masters and tenant-scoped BOM rules.
-- ASCII-only, idempotent, and safe to apply through node-postgres.
-- A bom_rule row maps one raw material to one product/window condition.

BEGIN;

CREATE TABLE IF NOT EXISTS public.raw_materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      text NOT NULL DEFAULT 'venkateshwara',
  sku            text NOT NULL DEFAULT '',
  name           text NOT NULL,
  category       text NOT NULL
                 CHECK (category IN ('profile','glass','hardware','accessory','consumable')),
  specification  jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit           text NOT NULL DEFAULT 'nos',
  unit_cost      numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level  numeric(12,3) NOT NULL DEFAULT 0,
  supplier       text NOT NULL DEFAULT '',
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_materials_client_id_id_key UNIQUE (client_id, id),
  CONSTRAINT raw_materials_unit_cost_chk CHECK (unit_cost >= 0),
  CONSTRAINT raw_materials_stock_quantity_chk CHECK (stock_quantity >= 0),
  CONSTRAINT raw_materials_reorder_level_chk CHECK (reorder_level >= 0),
  CONSTRAINT raw_materials_specification_object_chk
    CHECK (jsonb_typeof(specification) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_materials_client_sku_unique_idx
  ON public.raw_materials (client_id, sku)
  WHERE sku <> '';

CREATE INDEX IF NOT EXISTS raw_materials_client_category_idx
  ON public.raw_materials (client_id, category, is_active);

CREATE INDEX IF NOT EXISTS raw_materials_client_name_idx
  ON public.raw_materials (client_id, name);

CREATE TABLE IF NOT EXISTS public.bom_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text NOT NULL DEFAULT 'venkateshwara',
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  raw_material_id   uuid NOT NULL,
  rule_name         text NOT NULL,
  window_type       text NOT NULL DEFAULT 'any'
                    CHECK (window_type IN ('any','fixed','sliding','casement','tilt_turn')),
  component_type    text NOT NULL
                    CHECK (component_type IN ('profile','glass','hardware','accessory','consumable')),
  quantity_formula  text NOT NULL DEFAULT 'quantity',
  quantity_factor   numeric(12,4) NOT NULL DEFAULT 1,
  waste_percent     numeric(5,2) NOT NULL DEFAULT 0,
  conditions        jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority          integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bom_rules_material_tenant_fk
    FOREIGN KEY (client_id, raw_material_id)
    REFERENCES public.raw_materials (client_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT bom_rules_quantity_factor_chk CHECK (quantity_factor >= 0),
  CONSTRAINT bom_rules_waste_percent_chk CHECK (waste_percent >= 0 AND waste_percent <= 100),
  CONSTRAINT bom_rules_conditions_object_chk
    CHECK (jsonb_typeof(conditions) = 'object')
);

CREATE INDEX IF NOT EXISTS bom_rules_client_active_idx
  ON public.bom_rules (client_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS bom_rules_client_product_idx
  ON public.bom_rules (client_id, product_id, is_active)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bom_rules_client_window_idx
  ON public.bom_rules (client_id, window_type, component_type, is_active);

CREATE INDEX IF NOT EXISTS bom_rules_client_material_idx
  ON public.bom_rules (client_id, raw_material_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS set_updated_at_raw_materials ON public.raw_materials;
    CREATE TRIGGER set_updated_at_raw_materials
      BEFORE UPDATE ON public.raw_materials
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS set_updated_at_bom_rules ON public.bom_rules;
    CREATE TRIGGER set_updated_at_bom_rules
      BEFORE UPDATE ON public.bom_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access on raw_materials" ON public.raw_materials;
CREATE POLICY "Allow service_role full access on raw_materials"
  ON public.raw_materials
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "client_isolation_raw_materials" ON public.raw_materials;
CREATE POLICY "client_isolation_raw_materials"
  ON public.raw_materials
  FOR ALL TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

ALTER TABLE public.bom_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access on bom_rules" ON public.bom_rules;
CREATE POLICY "Allow service_role full access on bom_rules"
  ON public.bom_rules
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "client_isolation_bom_rules" ON public.bom_rules;
CREATE POLICY "client_isolation_bom_rules"
  ON public.bom_rules
  FOR ALL TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMENT ON TABLE public.raw_materials IS
  'Tenant-scoped manufacturing material master used by the BOM engine.';
COMMENT ON TABLE public.bom_rules IS
  'Tenant-scoped material requirements; quantity_formula is interpreted by the BOM calculator.';

COMMIT;

NOTIFY pgrst, 'reload schema';
