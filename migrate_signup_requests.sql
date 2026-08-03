-- Signup / prebooking requests for unregistered users (UPVC businesses)
CREATE TABLE IF NOT EXISTS public.signup_requests (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    auth_method TEXT,               -- 'google' | 'password'
    password_hash TEXT,             -- sha256(password) for password registrations
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | submitted | approved | rejected
    config JSONB NOT NULL DEFAULT '{}',      -- company details, autosaved on every change
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_email ON public.signup_requests (email);

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_requests FROM anon, authenticated;
GRANT ALL ON public.signup_requests TO service_role;
