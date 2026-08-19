-- Add client_id to unmeasured_items (was lost in project migration)
ALTER TABLE public.unmeasured_items
  ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'venkateshwara' NOT NULL;

-- Add client_id to measured_items (same issue)
ALTER TABLE public.measured_items
  ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'venkateshwara' NOT NULL;

-- Index for client-scoped queries (matching convention from other tables)
CREATE INDEX IF NOT EXISTS idx_unmeasured_items_client
  ON public.unmeasured_items (client_id);

CREATE INDEX IF NOT EXISTS idx_measured_items_client
  ON public.measured_items (client_id);