-- Close the final integrity gaps found during the full offline-recovery audit.
-- Advance Paid is a KPRUPVC-specific quotation feature; every other tenant
-- must continue to store zero even if a malformed/custom client calls the RPC.

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_advance_paid_nonnegative;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_advance_paid_nonnegative
  CHECK (advance_paid >= 0 AND advance_paid <> 'NaN'::numeric);

CREATE OR REPLACE FUNCTION public.scope_quotation_advance_paid_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM 'kprupvc' THEN
    NEW.advance_paid := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_scope_advance_paid ON public.quotations;
CREATE TRIGGER quotations_scope_advance_paid
BEFORE INSERT OR UPDATE OF advance_paid, client_id ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.scope_quotation_advance_paid_v1();

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_advance_paid_kpr_only;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_advance_paid_kpr_only
  CHECK (client_id = 'kprupvc' OR advance_paid = 0);

COMMENT ON CONSTRAINT quotations_advance_paid_kpr_only
  ON public.quotations IS
  'Advance Paid is enabled only for the KPRUPVC quotation workflow.';

NOTIFY pgrst, 'reload schema';
