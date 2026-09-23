-- ============================================================================
-- Migration 055 -- Field Executive Module (ADDITIVE ONLY)
-- Extends existing quotations/leads/projects WITHOUT altering them.
-- New tables: executive_tasks, task_checkins, followup_reminders, whatsapp_logs
-- Pilot: kprupvc. All tables tenant-isolated via client_id + RLS.
-- IDEMPOTENT -- safe to re-run
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. executive_tasks -- per-visit actionable unit (NOT projects replacement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.executive_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'venkateshwara',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  assigned_to text NOT NULL DEFAULT '',
  assigned_by text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','cancelled')),
  priority smallint NOT NULL DEFAULT 1,
  due_at timestamptz NULL,
  done_at timestamptz NULL,
  location_lat double precision NULL,
  location_lng double precision NULL,
  location_address text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_executive_tasks_client ON public.executive_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_executive_tasks_assignee ON public.executive_tasks (client_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_executive_tasks_due ON public.executive_tasks (client_id, due_at) WHERE status IN ('pending','in_progress');

ALTER TABLE public.executive_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation_executive_tasks' AND tablename = 'executive_tasks'
  ) THEN
    CREATE POLICY client_isolation_executive_tasks ON public.executive_tasks
      FOR ALL TO anon, authenticated
      USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
      WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access on executive_tasks' AND tablename = 'executive_tasks'
  ) THEN
    CREATE POLICY "Allow service_role full access on executive_tasks" ON public.executive_tasks
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. task_checkins -- foreground check-in audit (NO continuous tracking)
-- Privacy: one row per explicit user tap only. Retention 30 days (purged by app/cron).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'venkateshwara',
  task_id uuid NOT NULL REFERENCES public.executive_tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL DEFAULT '',
  lat double precision NULL,
  lng double precision NULL,
  accuracy_m double precision NULL,
  address text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_checkins_task ON public.task_checkins (task_id);
CREATE INDEX IF NOT EXISTS idx_task_checkins_client ON public.task_checkins (client_id, created_at DESC);

ALTER TABLE public.task_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation_task_checkins' AND tablename = 'task_checkins'
  ) THEN
    CREATE POLICY client_isolation_task_checkins ON public.task_checkins
      FOR ALL TO anon, authenticated
      USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
      WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access on task_checkins' AND tablename = 'task_checkins'
  ) THEN
    CREATE POLICY "Allow service_role full access on task_checkins" ON public.task_checkins
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. followup_reminders -- scheduled reminders (additive to leads.next_followup)
-- leads.next_followup stays for simple CRM; this table drives automation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.followup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'venkateshwara',
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
  assigned_to text NOT NULL DEFAULT '',
  remind_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'push' CHECK (channel IN ('push','whatsapp','email')),
  template_key text NOT NULL DEFAULT 'followup_reminder',
  payload jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','cancelled','failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_reminders_due ON public.followup_reminders (client_id, remind_at)
  WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_reminders_lead ON public.followup_reminders (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE public.followup_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation_followup_reminders' AND tablename = 'followup_reminders'
  ) THEN
    CREATE POLICY client_isolation_followup_reminders ON public.followup_reminders
      FOR ALL TO anon, authenticated
      USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
      WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access on followup_reminders' AND tablename = 'followup_reminders'
  ) THEN
    CREATE POLICY "Allow service_role full access on followup_reminders" ON public.followup_reminders
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. whatsapp_logs -- provider-agnostic delivery log (wa.me today, BSP tomorrow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'venkateshwara',
  to_phone text NOT NULL DEFAULT '',
  template text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  related_id uuid NULL,
  channel text NOT NULL DEFAULT 'wa.me' CHECK (channel IN ('wa.me','bsp','email','portal')),
  provider_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'logged',
  error text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_client ON public.whatsapp_logs (client_id, created_at DESC);

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'client_isolation_whatsapp_logs' AND tablename = 'whatsapp_logs'
  ) THEN
    CREATE POLICY client_isolation_whatsapp_logs ON public.whatsapp_logs
      FOR ALL TO anon, authenticated
      USING (client_id = current_setting('request.headers', true)::json->>'x-client-id')
      WITH CHECK (client_id = current_setting('request.headers', true)::json->>'x-client-id');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access on whatsapp_logs' AND tablename = 'whatsapp_logs'
  ) THEN
    CREATE POLICY "Allow service_role full access on whatsapp_logs" ON public.whatsapp_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime for owner portal badges (additive; existing publication untouched otherwise)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.executive_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_reminders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
