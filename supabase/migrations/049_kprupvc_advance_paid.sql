-- KPRUPVC-only quotation advance display. Existing clients retain the default 0.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS advance_paid numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_advance_paid_nonnegative;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_advance_paid_nonnegative CHECK (advance_paid >= 0);

COMMENT ON COLUMN public.quotations.advance_paid IS
  'Customer advance captured by the KPRUPVC quotation flow; does not change grand total.';

NOTIFY pgrst, 'reload schema';
