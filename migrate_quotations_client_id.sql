-- Add client_id to quotations table (was missing from original schema)
-- This column is used by _autoSaveToDatabase() to scope saves per client
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS client_id TEXT;