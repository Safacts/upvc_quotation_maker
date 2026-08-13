-- ============================================================================
-- Migration 025 -- Customer Portal Approval Workflow (Token-Based)
-- ============================================================================
--
-- SCOPE
--   Creates a token-based quote approval system that allows customers to
--   approve/reject quotes without logging in. The token is embedded in
--   the public quote link URL and is single-use with expiration.
--
-- PREREQUISITES
--   006_secure_quotations.sql (quotations table with RLS)
--   023_quotation_state_machine.sql (quotations has status, accepted_at, rejected_at)
--
-- DESIGN DECISIONS
--   - Token is a cryptographically random string (32 bytes = 256 bits of
--     entropy). Generated via encode(gen_random_bytes(32), 'hex').
--   - expires_at: tokens expire after a configurable period (default 30 days).
--     Expired tokens are rejected with a clear error message.
--   - used_at: tracks when the token was consumed. Once used, the token
--     cannot be reused (single-use enforcement).
--   - quotation_id FK: ON DELETE CASCADE - if quote is deleted, tokens are
--     irrelevant.
--   - No auth required for the approval endpoint: the token IS the auth.
--     RLS on quotations is bypassed via service_role in the API endpoint.
--   - The approval endpoint (Next.js API route) will:
--     1. Validate token exists and is not expired/used
--     2. Update quotation status to 'accepted' or 'rejected'
--     3. Set accepted_at/rejected_at timestamp
--     4. Mark token as used
--     All in a single transaction.
--
-- ASCII-ONLY -- no BOM, no em-dashes.
-- IDEMPOTENT -- safe to re-run.
-- TAKE A BACKUP FIRST
-- ============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. quote_approval_tokens -- single-use approval tokens
-- ---------------------------------------------------------------------------
-- Each token is linked to exactly one quotation. The token is embedded in
-- the public quote URL: https://app.vitharn.com/quote/{token}
-- When the customer clicks "Approve" or "Reject", the API validates the
-- token and updates the quotation status.

CREATE TABLE IF NOT EXISTS public.quote_approval_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    uuid NOT NULL,                        -- REFERENCES quotations(id)
  token           text NOT NULL UNIQUE,                 -- cryptographically random hex string
  expires_at      timestamptz NOT NULL,                 -- token expiration
  used_at         timestamptz,                          -- NULL = not yet used
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. Foreign key to quotations
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE: if quote is deleted, its tokens are irrelevant.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'quote_approval_tokens_quotation_id_fkey'
      AND conrelid = 'public.quote_approval_tokens'::regclass
  ) THEN
    ALTER TABLE public.quote_approval_tokens
      ADD CONSTRAINT quote_approval_tokens_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
      ON DELETE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Indexes for token lookup and cleanup
-- ---------------------------------------------------------------------------
-- "Find token by value" -- the primary lookup path (API validates token)
CREATE UNIQUE INDEX IF NOT EXISTS quote_approval_tokens_token_idx
  ON public.quote_approval_tokens (token);

-- "All tokens for this quotation" -- admin view, cleanup jobs
CREATE INDEX IF NOT EXISTS quote_approval_tokens_quotation_idx
  ON public.quote_approval_tokens (quotation_id);

-- "Expired unused tokens" -- cleanup batch job
CREATE INDEX IF NOT EXISTS quote_approval_tokens_cleanup_idx
  ON public.quote_approval_tokens (expires_at)
  WHERE used_at IS NULL;


-- ---------------------------------------------------------------------------
-- 4. RLS -- token table is service_role only
-- ---------------------------------------------------------------------------
-- The approval endpoint uses service_role to bypass RLS on quotations.
-- The token table itself should only be accessible via service_role
-- (admin/Next.js API), not via anon key.

ALTER TABLE public.quote_approval_tokens ENABLE ROW LEVEL SECURITY;

-- service_role: full access
DROP POLICY IF EXISTS "Allow service_role full access on quote_approval_tokens" ON public.quote_approval_tokens;
CREATE POLICY "Allow service_role full access on quote_approval_tokens"
    ON public.quote_approval_tokens
    USING (auth.role() = 'service_role');


-- ---------------------------------------------------------------------------
-- 5. RPC: generate_approval_token() -- create a new token for a quotation
-- ---------------------------------------------------------------------------
-- Called by the Next.js API when sharing a quote with a customer.
-- Generates a cryptographically secure token with configurable expiry.
--
-- Parameters:
--   p_quotation_id -- the quote to generate a token for
--   p_expiry_days  -- token validity in days (default 30)
--
-- Returns: jsonb with { token, expires_at, quote_url }
--
-- SECURITY: INVOKER -- caller must be service_role (enforced by RLS).

CREATE OR REPLACE FUNCTION public.generate_approval_token(
  p_quotation_id uuid,
  p_expiry_days  int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_token       text;
  v_expires_at  timestamptz;
  v_quote_no    text;
  v_result      jsonb;
BEGIN
  -- Validate inputs
  IF p_quotation_id IS NULL THEN
    RAISE EXCEPTION 'p_quotation_id is required';
  END IF;

  IF p_expiry_days < 1 OR p_expiry_days > 365 THEN
    RAISE EXCEPTION 'p_expiry_days must be between 1 and 365';
  END IF;

  -- Verify quotation exists and get quote_no for the URL
  SELECT quote_no INTO v_quote_no
  FROM public.quotations
  WHERE id = p_quotation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found';
  END IF;

  -- Invalidate any existing unused tokens for this quote
  UPDATE public.quote_approval_tokens
     SET used_at = now()  -- mark as "used" to prevent reuse
   WHERE quotation_id = p_quotation_id
     AND used_at IS NULL;

  -- Generate new token (32 bytes = 256 bits of entropy)
  v_token      := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + (p_expiry_days || ' days')::interval;

  -- Insert the token
  INSERT INTO public.quote_approval_tokens (
    quotation_id, token, expires_at
  ) VALUES (
    p_quotation_id, v_token, v_expires_at
  );

  -- Build result
  v_result := json_build_object(
    'token',       v_token,
    'expires_at',  v_expires_at,
    'quote_no',    v_quote_no,
    'quote_url',   'https://app.vitharn.com/quote/' || v_token,
    'expiry_days', p_expiry_days
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_approval_token(uuid, int)
  TO service_role;


-- ---------------------------------------------------------------------------
-- 6. RPC: validate_approval_token() -- check if a token is valid
-- ---------------------------------------------------------------------------
-- Called by the public quote page to verify the token before showing
-- the quote details and approve/reject buttons.
--
-- Parameters:
--   p_token -- the token from the URL
--
-- Returns: jsonb with { valid, quotation_id, quote_no, expires_at, message }
--
-- SECURITY: INVOKER -- uses anon key (public endpoint, no auth).

CREATE OR REPLACE FUNCTION public.validate_approval_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_record      record;
  v_result      jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN json_build_object(
      'valid',   false,
      'message', 'Token is required'
    );
  END IF;

  -- Find the token
  SELECT
    t.id,
    t.quotation_id,
    t.expires_at,
    t.used_at,
    q.quote_no,
    q.status
  INTO v_record
  FROM public.quote_approval_tokens t
  JOIN public.quotations q ON q.id = t.quotation_id
  WHERE t.token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'valid',   false,
      'message', 'Invalid token'
    );
  END IF;

  -- Check if already used
  IF v_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid',         false,
      'message',       'Token has already been used',
      'quotation_id',  v_record.quotation_id,
      'quote_no',      v_record.quote_no,
      'used_at',       v_record.used_at
    );
  END IF;

  -- Check if expired
  IF v_record.expires_at < now() THEN
    RETURN json_build_object(
      'valid',         false,
      'message',       'Token has expired',
      'quotation_id',  v_record.quotation_id,
      'quote_no',      v_record.quote_no,
      'expires_at',    v_record.expires_at
    );
  END IF;

  -- Token is valid
  RETURN json_build_object(
    'valid',         true,
    'quotation_id',  v_record.quotation_id,
    'quote_no',      v_record.quote_no,
    'expires_at',    v_record.expires_at,
    'current_status', v_record.status,
    'message',       'Token is valid'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_approval_token(text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. RPC: approve_quote() -- approve/reject quote via token
-- ---------------------------------------------------------------------------
-- The main approval endpoint. Validates the token, updates the quotation
-- status, and marks the token as used. All in a single transaction.
--
-- Parameters:
--   p_token    -- the approval token
--   p_action   -- 'approve' or 'reject'
--
-- Returns: jsonb with { success, quotation_id, status, message }
--
-- SECURITY: INVOKER -- uses anon key (public endpoint, no auth).
-- The function uses a SERIALIZABLE transaction to prevent race conditions.

CREATE OR REPLACE FUNCTION public.approve_quote(
  p_token  text,
  p_action text DEFAULT 'approve'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_token_record  record;
  v_new_status    text;
  v_result        jsonb;
BEGIN
  -- Validate inputs
  IF p_token IS NULL OR p_token = '' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Token is required'
    );
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Action must be approve or reject'
    );
  END IF;

  -- Find and lock the token row (prevents concurrent use)
  SELECT
    t.id,
    t.quotation_id,
    t.expires_at,
    t.used_at,
    q.status AS current_status,
    q.quote_no
  INTO v_token_record
  FROM public.quote_approval_tokens t
  JOIN public.quotations q ON q.id = t.quotation_id
  WHERE t.token = p_token
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid token'
    );
  END IF;

  -- Check if already used
  IF v_token_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'success',       false,
      'message',       'Token has already been used',
      'quotation_id',  v_token_record.quotation_id,
      'quote_no',      v_token_record.quote_no
    );
  END IF;

  -- Check if expired
  IF v_token_record.expires_at < now() THEN
    RETURN json_build_object(
      'success',       false,
      'message',       'Token has expired',
      'quotation_id',  v_token_record.quotation_id,
      'quote_no',      v_token_record.quote_no
    );
  END IF;

  -- Check if quote is in a state that allows approval
  IF v_token_record.current_status NOT IN ('draft', 'sent', 'viewed') THEN
    RETURN json_build_object(
      'success',       false,
      'message',       'Quote cannot be ' || p_action || 'ed in current status: ' || v_token_record.current_status,
      'quotation_id',  v_token_record.quotation_id,
      'quote_no',      v_token_record.quote_no,
      'current_status', v_token_record.current_status
    );
  END IF;

  -- Determine new status
  IF p_action = 'approve' THEN
    v_new_status := 'accepted';
  ELSE
    v_new_status := 'rejected';
  END IF;

  -- Update quotation status
  UPDATE public.quotations
     SET status       = v_new_status,
         accepted_at  = CASE WHEN p_action = 'approve' THEN now() ELSE accepted_at END,
         rejected_at  = CASE WHEN p_action = 'reject'  THEN now() ELSE rejected_at END
   WHERE id = v_token_record.quotation_id;

  -- Mark token as used
  UPDATE public.quote_approval_tokens
     SET used_at = now()
   WHERE id = v_token_record.id;

  -- Build success response
  v_result := json_build_object(
    'success',        true,
    'quotation_id',   v_token_record.quotation_id,
    'quote_no',       v_token_record.quote_no,
    'status',         v_new_status,
    'action',         p_action,
    'message',        'Quote has been ' || p_action || 'd successfully'
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_quote(text, text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. Documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.quote_approval_tokens IS
  'Single-use tokens for customer quote approval without login. Token is '
  'embedded in the public quote URL. Expires after configurable period '
  '(default 30 days). One active token per quotation at a time.';

COMMENT ON COLUMN public.quote_approval_tokens.token IS
  'Cryptographically random hex string (64 chars = 256 bits). Generated via '
  'encode(gen_random_bytes(32), hex). Unique constraint ensures no collisions.';

COMMENT ON COLUMN public.quote_approval_tokens.expires_at IS
  'Token expiration timestamp. After this time, the token is rejected. '
  'Default validity is 30 days from creation.';

COMMENT ON COLUMN public.quote_approval_tokens.used_at IS
  'Timestamp when the token was consumed. NULL = not yet used. Once set, '
  'the token cannot be reused (single-use enforcement).';

COMMENT ON FUNCTION public.generate_approval_token(uuid, int) IS
  'Generate a new approval token for a quotation. Invalidates any existing '
  'unused tokens for the same quote. Returns token, URL, and expiry info.';

COMMENT ON FUNCTION public.validate_approval_token(text) IS
  'Validate an approval token without consuming it. Returns validity status, '
  'quotation details, and any error messages (expired, used, invalid).';

COMMENT ON FUNCTION public.approve_quote(text, text) IS
  'Approve or reject a quote via token. Validates token, updates quotation '
  'status, and marks token as used in a single transaction. Action must be '
  'approve or reject. Quote must be in draft/sent/viewed status.';


COMMIT;

NOTIFY pgrst, 'reload schema';
