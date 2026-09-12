BEGIN;

-- Persistent Tara conversations are platform-admin data, not tenant data.
-- The Next.js API enforces ownership after authenticating the admin cookie.
CREATE TABLE IF NOT EXISTS public.tara_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL REFERENCES public.admins(email) ON DELETE CASCADE,
  legacy_id text,
  title text NOT NULL DEFAULT 'New Chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tara_conversations_title_length CHECK (char_length(title) BETWEEN 1 AND 200)
);

ALTER TABLE public.tara_conversations
  ADD COLUMN IF NOT EXISTS legacy_id text;

CREATE INDEX IF NOT EXISTS tara_conversations_admin_updated_idx
  ON public.tara_conversations (admin_email, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS tara_conversations_admin_legacy_idx
  ON public.tara_conversations (admin_email, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tara_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.tara_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  tool_logs jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tara_messages_conversation_created_idx
  ON public.tara_messages (conversation_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.set_tara_conversation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_tara_conversation_updated_at() SET search_path = public;

DROP TRIGGER IF EXISTS set_tara_conversation_updated_at ON public.tara_conversations;
CREATE TRIGGER set_tara_conversation_updated_at
  BEFORE UPDATE ON public.tara_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_tara_conversation_updated_at();

ALTER TABLE public.tara_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tara_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tara_conversations_service_role_all ON public.tara_conversations;
CREATE POLICY tara_conversations_service_role_all
  ON public.tara_conversations
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tara_messages_service_role_all ON public.tara_messages;
CREATE POLICY tara_messages_service_role_all
  ON public.tara_messages
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.tara_conversations FROM anon, authenticated;
REVOKE ALL ON public.tara_messages FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tara_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tara_messages TO service_role;

COMMENT ON TABLE public.tara_conversations IS
  'Persistent Tara AI conversations owned by platform admins.';
COMMENT ON TABLE public.tara_messages IS
  'Persistent Tara user and assistant messages; service-role API access only.';

COMMIT;
NOTIFY pgrst, 'reload schema';
