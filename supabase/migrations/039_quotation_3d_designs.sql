-- 039: topology snapshots attached to quotations.
-- The existing window_designs table remains the reusable catalogue; this table
-- preserves the exact design used by a quotation and is tenant isolated.
BEGIN;
CREATE TABLE IF NOT EXISTS public.quotation_3d_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  quotation_id uuid NOT NULL,
  topology jsonb NOT NULL,
  bom_snapshot jsonb NOT NULL DEFAULT '{"lines":[],"totals":{}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, quotation_id),
  CONSTRAINT quotation_3d_designs_quotation_fk FOREIGN KEY (quotation_id)
    REFERENCES public.quotations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS quotation_3d_designs_client_idx ON public.quotation_3d_designs (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotation_3d_designs_quotation_idx ON public.quotation_3d_designs (quotation_id);
ALTER TABLE public.quotation_3d_designs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_quotation_3d_designs" ON public.quotation_3d_designs;
CREATE POLICY "service_role_quotation_3d_designs" ON public.quotation_3d_designs USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "client_isolation_quotation_3d_designs" ON public.quotation_3d_designs;
CREATE POLICY "client_isolation_quotation_3d_designs" ON public.quotation_3d_designs FOR ALL TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
  WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');
COMMIT;
NOTIFY pgrst, 'reload schema';
