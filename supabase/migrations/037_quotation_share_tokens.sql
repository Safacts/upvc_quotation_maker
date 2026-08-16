-- Secure, revocable quotation share links.
-- The raw 128-bit bearer token is returned once; only its SHA-256 digest is stored.
BEGIN;

CREATE TABLE IF NOT EXISTS public.quotation_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_share_tokens_lookup_idx
  ON public.quotation_share_tokens (quotation_id, token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS quotation_share_tokens_expiry_idx
  ON public.quotation_share_tokens (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.quotation_share_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotation_share_tokens FROM anon, authenticated;
GRANT ALL ON public.quotation_share_tokens TO service_role;

COMMENT ON TABLE public.quotation_share_tokens IS
  'Opaque 128-bit quotation share tokens; token_hash is stored, raw token is never persisted.';

COMMIT;
NOTIFY pgrst, 'reload schema';
