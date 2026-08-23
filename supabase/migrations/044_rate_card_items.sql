CREATE TABLE IF NOT EXISTS public.rate_card_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL,
  item_type       text NOT NULL
                  CHECK (item_type IN ('any','fixed','sliding','casement','french','tilt_turn','villa_grill','arch','custom')),
  glass_spec      text,
  mesh_type       text
                  CHECK (mesh_type IS NULL OR mesh_type IN ('none','plain','pleated','magnetic')),
  hardware_tier   text
                  CHECK (hardware_tier IS NULL OR hardware_tier IN ('basic','standard','premium')),
  price_per_sqft  numeric NOT NULL CHECK (price_per_sqft > 0),
  min_width_mm    integer,
  max_width_mm    integer,
  min_height_mm   integer,
  max_height_mm   integer,
  validity_start  date,
  validity_end    date,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_items_dims_chk CHECK (
    (min_width_mm  IS NULL OR min_width_mm  >= 0) AND
    (max_width_mm  IS NULL OR max_width_mm  >= 0) AND
    (min_height_mm IS NULL OR min_height_mm >= 0) AND
    (max_height_mm IS NULL OR max_height_mm >= 0) AND
    (min_width_mm  IS NULL OR max_width_mm  IS NULL OR min_width_mm  <= max_width_mm) AND
    (min_height_mm IS NULL OR max_height_mm IS NULL OR min_height_mm <= max_height_mm) AND
    (validity_start IS NULL OR validity_end IS NULL OR validity_start <= validity_end)
  )
);

CREATE INDEX IF NOT EXISTS idx_rate_card_items_client        ON public.rate_card_items(client_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_items_client_type   ON public.rate_card_items(client_id, item_type);
CREATE INDEX IF NOT EXISTS idx_rate_card_items_active        ON public.rate_card_items(is_active);
CREATE INDEX IF NOT EXISTS idx_rate_card_items_validity_end  ON public.rate_card_items(validity_end);

ALTER TABLE public.rate_card_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on rate_card_items" ON public.rate_card_items;
CREATE POLICY "Allow public all on rate_card_items"
    ON public.rate_card_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access on rate_card_items" ON public.rate_card_items;
CREATE POLICY "Allow service_role full access on rate_card_items"
    ON public.rate_card_items
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "client_isolation_rate_card_items" ON public.rate_card_items;
CREATE POLICY "client_isolation_rate_card_items"
    ON public.rate_card_items
    FOR ALL
    TO anon, authenticated
    USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
    WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');

DROP TRIGGER IF EXISTS set_updated_at_rate_card_items ON public.rate_card_items;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_updated_at_rate_card_items
      BEFORE UPDATE ON public.rate_card_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
