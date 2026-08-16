-- Migration 035: per-window UPVC BOM configuration.
-- The JSONB shape stays attached to the measured line so a quotation remains
-- historically correct even if a product master changes later.
BEGIN;

ALTER TABLE public.measured_items
  ADD COLUMN IF NOT EXISTS bom_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'measured_items_bom_config_object_chk'
      AND conrelid = 'public.measured_items'::regclass
  ) THEN
    ALTER TABLE public.measured_items
      ADD CONSTRAINT measured_items_bom_config_object_chk
      CHECK (jsonb_typeof(bom_config) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.measured_items.bom_config IS
  'Per-window UPVC BOM snapshot: {profile:{...},glass:{...},hardware:[...]}';

CREATE INDEX IF NOT EXISTS idx_measured_items_bom_config
  ON public.measured_items USING gin (bom_config);

NOTIFY pgrst, 'reload schema';
COMMIT;
