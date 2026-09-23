BEGIN;

-- 059: interstate flag for quotations (CGST+SGST vs IGST display split).
--
-- Quotations historically rendered the whole tax as a single "IGST" line even
-- for intra-state sales, which must read CGST + SGST. The amounts do NOT
-- change here: existing rows default to false (intra-state) and the split is
-- paisa-exact (CGST + SGST == old lump). The app persists the flag per
-- quotation; the NOTIFY reloads the PostgREST schema cache so the new column
-- is immediately writable.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

COMMIT;
