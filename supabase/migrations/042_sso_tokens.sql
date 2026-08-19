-- SSO Tokens table for one-time use token tracking
CREATE TABLE IF NOT EXISTS public.sso_tokens (
  id BIGSERIAL PRIMARY KEY,
  jti UUID NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_sso_tokens_jti ON public.sso_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_sso_tokens_client_id ON public.sso_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_sso_tokens_expires_at ON public.sso_tokens(expires_at);

-- RLS policies
ALTER TABLE public.sso_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access (validated via API routes)
CREATE POLICY "sso_tokens_service_role_all" ON public.sso_tokens
  FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-cleanup function for expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_sso_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM public.sso_tokens
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;