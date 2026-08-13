BEGIN;

CREATE TABLE IF NOT EXISTS public.cutting_lists (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           text NOT NULL DEFAULT 'venkateshwara',
  order_id            uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  profile_type        text NOT NULL,
  stock_length_mm     integer NOT NULL,
  cuts                jsonb NOT NULL,
  optimized_cuts      jsonb,
  wastage_percent     numeric(5,2),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','cutting','completed')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cutting_lists_client_idx
  ON public.cutting_lists (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cutting_lists_order_idx
  ON public.cutting_lists (client_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cutting_lists_status_idx
  ON public.cutting_lists (client_id, status);

ALTER TABLE public.cutting_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on cutting_lists" ON public.cutting_lists;
CREATE POLICY "Allow service_role full access on cutting_lists"
    ON public.cutting_lists
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_cutting_lists" ON public.cutting_lists;
CREATE POLICY "client_isolation_cutting_lists"
    ON public.cutting_lists
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


CREATE TABLE IF NOT EXISTS public.materials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  order_id      uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  material_type text NOT NULL
                CHECK (material_type IN ('profile','glass','hardware','sealant')),
  specification text NOT NULL DEFAULT '',
  quantity      numeric(10,2) NOT NULL,
  unit          text NOT NULL,
  unit_cost     numeric(10,2),
  total_cost    numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','ordered','received','used')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materials_client_idx
  ON public.materials (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS materials_order_idx
  ON public.materials (client_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS materials_type_idx
  ON public.materials (client_id, material_type);

CREATE INDEX IF NOT EXISTS materials_status_idx
  ON public.materials (client_id, status);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on materials" ON public.materials;
CREATE POLICY "Allow service_role full access on materials"
    ON public.materials
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_materials" ON public.materials;
CREATE POLICY "client_isolation_materials"
    ON public.materials
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


CREATE TABLE IF NOT EXISTS public.hardware (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text NOT NULL DEFAULT 'venkateshwara',
  name          text NOT NULL,
  type          text NOT NULL
                CHECK (type IN ('handle','lock','hinge','roller','bracket','seal')),
  brand         text NOT NULL DEFAULT '',
  model         text NOT NULL DEFAULT '',
  quantity      numeric(10,2) NOT NULL DEFAULT 0,
  unit          text NOT NULL DEFAULT 'nos',
  reorder_level numeric(10,2) NOT NULL DEFAULT 0,
  cost_per_unit numeric(10,2),
  supplier      text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hardware_client_idx
  ON public.hardware (client_id, name);

CREATE INDEX IF NOT EXISTS hardware_type_idx
  ON public.hardware (client_id, type);

ALTER TABLE public.hardware ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on hardware" ON public.hardware;
CREATE POLICY "Allow service_role full access on hardware"
    ON public.hardware
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_hardware" ON public.hardware;
CREATE POLICY "client_isolation_hardware"
    ON public.hardware
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');


CREATE TABLE IF NOT EXISTS public.offcuts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  cutting_list_id uuid REFERENCES public.cutting_lists(id) ON DELETE SET NULL,
  profile_type    text NOT NULL,
  length_mm       integer NOT NULL,
  status          text NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','used','discarded')),
  location        text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offcuts_client_idx
  ON public.offcuts (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS offcuts_status_idx
  ON public.offcuts (client_id, status)
  WHERE status = 'available';

CREATE INDEX IF NOT EXISTS offcuts_profile_idx
  ON public.offcuts (client_id, profile_type, status);

CREATE INDEX IF NOT EXISTS offcuts_cutting_list_idx
  ON public.offcuts (cutting_list_id)
  WHERE cutting_list_id IS NOT NULL;

ALTER TABLE public.offcuts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on offcuts" ON public.offcuts;
CREATE POLICY "Allow service_role full access on offcuts"
    ON public.offcuts
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_offcuts" ON public.offcuts;
CREATE POLICY "client_isolation_offcuts"
    ON public.offcuts
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

COMMIT;

NOTIFY pgrst, 'reload schema';
