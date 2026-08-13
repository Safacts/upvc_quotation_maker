-- Migration 027: Data export audit log
-- Tracks one-click data exports for the data portability guarantee.
-- Every export is logged with record counts and file size so we can
-- answer "who exported what, when, and how big" without guessing.

CREATE TABLE IF NOT EXISTS public.data_export_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id text NOT NULL,
  exported_by text NOT NULL,
  format text NOT NULL DEFAULT 'zip',
  record_counts jsonb,
  file_size_bytes integer,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for the two query patterns: "show me my exports" and "show me all exports for a client"
CREATE INDEX IF NOT EXISTS data_export_log_client_created_idx
  ON public.data_export_log (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS data_export_log_exported_by_idx
  ON public.data_export_log (exported_by, created_at DESC);

-- RLS: service_role only (API writes via service key)
ALTER TABLE public.data_export_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access on data_export_log" ON public.data_export_log;
CREATE POLICY "Allow service_role full access on data_export_log"
  ON public.data_export_log
  AS PERMISSIVE FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

GRANT SELECT, INSERT ON public.data_export_log TO service_role;

COMMENT ON TABLE public.data_export_log IS
  'Audit log for one-click data portability exports. Records who exported, when, what format, record counts, and file size.';
