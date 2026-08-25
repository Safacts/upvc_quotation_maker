-- 047: Harden client_public view - strip PII that was leaking via anon read
-- Hacker 25-08-2026: GET /rest/v1/client_public?select=config anon -> 200 with adminEmails, companyEmail, gstNumber, bank* in config JSONB
-- Fix: strip all PII, keep only public branding fields needed for market page

DROP VIEW IF EXISTS public.client_public;

CREATE VIEW public.client_public AS
 SELECT id,
    -- Strip all sensitive fields, keep only public market/branding data
    config
      - 'portalPasswordHash'::text
      - 'adminEmails'::text
      - 'companyEmail'::text
      - 'gstNumber'::text
      - 'bankName'::text
      - 'bankAccountNumber'::text
      - 'bankIfscCode'::text
      - 'bankBranch'::text
      - 'bankDetails'::text
      - 'adminEmail'::text
      AS config,
    trial_expires_at,
    is_active,
    created_at,
    updated_at,
    cost_margin_percent
   FROM clients
  WHERE is_active = true;

-- Ensure anon can still read the hardened view
GRANT SELECT ON public.client_public TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
