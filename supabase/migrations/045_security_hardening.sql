-- MIGRATION 045: SECURITY HARDENING (25-08-2026)
-- Remediation for authorized black-box pentest findings (live-exploited on prod).
-- Applied to PROD (Mumbai effxrwrbsjduvhmorvrq) via pooler 25-08-2026; policy
-- equivalents applied to ARCHIVE (Tokyo gumpmnbjdtzajhysnnaz) same day.
--
-- E1. World-open policies (re-added by later migrations after the 08-08 drop)
--     made quotations / measured_items / unmeasured_items / payments /
--     quotation_photos readable AND writable by anyone holding the public anon
--     key, with NO tenant header required. client_isolation_* policies remain
--     as the real tenant gate.
DROP POLICY IF EXISTS "Allow public all on quotations" ON public.quotations;
DROP POLICY IF EXISTS "Allow public all on measured_items" ON public.measured_items;
DROP POLICY IF EXISTS "Allow public all on unmeasured_items" ON public.unmeasured_items;
DROP POLICY IF EXISTS "Allow public all on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow public all on quotation_photos" ON public.quotation_photos;
DROP POLICY IF EXISTS "Allow public all on app_notifications" ON public.app_notifications;
DROP POLICY IF EXISTS "Allow public all on client_config_dynamic" ON public.client_config_dynamic;
DROP POLICY IF EXISTS "Allow public all on content_manifest" ON public.content_manifest;
DROP POLICY IF EXISTS "Allow public all on feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Allow public all on sync_log" ON public.sync_log;
-- Stale landmines on admins (grants revoked earlier; policies remained).
DROP POLICY IF EXISTS "Enable read access for all users" ON public.admins;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.admins;

-- E3. quotation_money view bypassed RLS (not security_invoker) and carried full
--     DML grants for anon/authenticated -> cross-tenant money read with zero headers.
REVOKE ALL ON public.quotation_money FROM anon, authenticated;
GRANT SELECT ON public.quotation_money TO anon, authenticated;
ALTER VIEW public.quotation_money SET (security_invoker = true);

-- E4. prod_* foreign tables (rollback pipe to old Tokyo DB) exposed over REST.
REVOKE ALL ON public.prod_admins, public.prod_clients, public.prod_customers,
  public.prod_gst_invoice_counters, public.prod_gst_invoice_items, public.prod_gst_invoices,
  public.prod_measured_items, public.prod_quotation_counters, public.prod_quotations,
  public.prod_sent_emails, public.prod_service_reviews, public.prod_signup_requests,
  public.prod_sso_tokens, public.prod_unmeasured_items, public.prod_vitharn_invoice_counters,
  public.prod_vitharn_invoice_items, public.prod_vitharn_invoices
FROM anon, authenticated;

-- E2. Global anonymous INSERT/UPDATE/DELETE on storage.objects allowed object
--     creation, logo overwrite (defacement) and deletion in every bucket.
--     Kept: Public Read Access. Added: scoped insert for Flutter site photo picker
--     path <clientId>/<quotationId>/<uuid>.jpg in site-photos only.
DROP POLICY IF EXISTS "Public Write Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
CREATE POLICY "site_photos_public_insert" ON storage.objects FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'site-photos'
    AND name ~ '^[^/]+/[^/]+/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}[.]jpg$'
  );

-- E6. quotations.status accepted arbitrary values (junk row insert proven live).
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_chk CHECK (status IN ('draft','sent','won','lost'));

NOTIFY pgrst, 'reload schema';

-- RESIDUAL RISK (documented, NOT fixed here): x-client-id header trust. The
-- anon key ships inside the public Flutter bundle and client_isolation_* RLS
-- trusts a client-supplied x-client-id header, so a determined attacker can
-- still read/write any SINGLE tenant by spoofing that header. Proper fix =
-- server-issued signed session bound into RLS (requires Flutter changes +
-- coordinated redeploy). Tracked for migration 046+.
