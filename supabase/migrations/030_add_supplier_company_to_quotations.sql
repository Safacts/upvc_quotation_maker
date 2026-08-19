-- Add supplier_company to quotations (was missing in new project)
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS supplier_company TEXT DEFAULT '';