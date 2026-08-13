-- ============================================================================
-- Migration 031 -- CRM, Lead Management & Project Dashboard
--                  Extends 029_barcode_shopfloor.sql
-- ============================================================================
--
-- TABLES
--   1. leads           -- CRM lead tracking
--   2. lead_activities -- activity log per lead (calls, emails, meetings)
--   3. projects        -- project dashboard with cost tracking
--
-- IDEMPOTENT -- safe to re-run
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. leads -- CRM lead tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  name            text NOT NULL,
  company         text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','qualified','proposal','negotiation','won','lost')),
  value           numeric(12,2) DEFAULT 0,
  notes           text NOT NULL DEFAULT '',
  assigned_to     text NOT NULL DEFAULT '',
  next_followup   date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_client_id ON public.leads (client_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (client_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON public.leads (client_id, next_followup)
  WHERE next_followup IS NOT NULL;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation' AND tablename = 'leads'
  ) THEN
    CREATE POLICY client_isolation ON public.leads
      USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. lead_activities -- activity log per lead
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type            text NOT NULL
                  CHECK (type IN ('call','email','whatsapp','meeting','note')),
  description     text NOT NULL DEFAULT '',
  outcome         text NOT NULL DEFAULT '',
  next_followup   date,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.lead_activities (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_client ON public.lead_activities (client_id);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation' AND tablename = 'lead_activities'
  ) THEN
    CREATE POLICY client_isolation ON public.lead_activities
      USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. projects -- project dashboard with cost tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL DEFAULT 'venkateshwara',
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  project_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'planning'
                  CHECK (status IN ('planning','in_progress','on_hold','completed','cancelled')),
  start_date      date,
  end_date        date,
  budget          numeric(12,2) DEFAULT 0,
  actual_cost     numeric(12,2) DEFAULT 0,
  progress        integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects (client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (client_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_order_id ON public.projects (order_id)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_lead_id ON public.projects (lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation' AND tablename = 'projects'
  ) THEN
    CREATE POLICY client_isolation ON public.projects
      USING (client_id = current_setting('request.jwt.claims', true)::json->>'client_id');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'leads_updated_at'
  ) THEN
    CREATE TRIGGER leads_updated_at
      BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'projects_updated_at'
  ) THEN
    CREATE TRIGGER projects_updated_at
      BEFORE UPDATE ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;


COMMIT;
