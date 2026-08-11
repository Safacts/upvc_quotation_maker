-- Fix: Add client_id to unmeasured_items and measured_items
-- This was lost during the Supabase project migration

ALTER TABLE IF EXISTS public.unmeasured_items 
  ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'venkateshwara' NOT NULL;

ALTER TABLE IF EXISTS public.measured_items 
  ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'venkateshwara' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unmeasured_items_client ON public.unmeasured_items (client_id);
CREATE INDEX IF NOT EXISTS idx_measured_items_client ON public.measured_items (client_id);
