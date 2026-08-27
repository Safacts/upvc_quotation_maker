-- Restore PostgREST relationships used by Flutter's nested quotation query.
-- Production already has these constraints; the guards keep this idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'measured_items_quotation_id_fkey'
      AND conrelid = 'public.measured_items'::regclass
  ) THEN
    ALTER TABLE public.measured_items
      ADD CONSTRAINT measured_items_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.measured_items
      VALIDATE CONSTRAINT measured_items_quotation_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unmeasured_items_quotation_id_fkey'
      AND conrelid = 'public.unmeasured_items'::regclass
  ) THEN
    ALTER TABLE public.unmeasured_items
      ADD CONSTRAINT unmeasured_items_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.unmeasured_items
      VALIDATE CONSTRAINT unmeasured_items_quotation_id_fkey;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
