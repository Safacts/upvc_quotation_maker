-- 047: Harden client_public view - strip sensitive fields from anon access
-- Black-hat audit 25-08-2026: client_public exposes adminEmails, gstNumber, bank* fields via anon

-- Create a secure view that strips sensitive fields for anon/authenticated
-- Keep the full config for service_role (via RLS on clients table)
DROP VIEW IF EXISTS public.client_public;

CREATE VIEW public.client_public AS
SELECT
  id,
  jsonb_build_object(
    'appName', COALESCE(config->>'appName', ''),
    'logoUrl', COALESCE(config->>'logoUrl', ''),
    'seoTitle', config->>'seoTitle',
    'gstNumber', '',  -- REDACTED for anon
    'bankBranch', '',  -- REDACTED
    'landingCTA', config->>'landingCTA',
    'accentColor', config->>'accentColor',
    'adminEmails', '[]'::jsonb,  -- REDACTED: empty array for anon
    'companyName', config->>'companyName',
    'quotePrefix', config->>'quotePrefix',
    'seoKeywords', config->>'seoKeywords',
    'companyEmail', '',  -- REDACTED
    'primaryColor', config->>'primaryColor',
    'bankAccountNo', '',  -- REDACTED
    'landingFooter', config->>'landingFooter',
    'landingMapUrl', config->>'landingMapUrl',
    'appDownloadUrl', config->>'appDownloadUrl',
    'appVersionCode', config->>'appVersionCode',
    'appVersionName', config->>'appVersionName',
    'companyAddress', config->>'companyAddress',
    'companyContact', config->>'companyContact',
    'landingGallery', config->>'landingGallery',
    'seoDescription', config->>'seoDescription',
    'landingServices', config->>'landingServices',
    'landingAboutText', config->>'landingAboutText',
    'landingHeroImage', config->>'landingHeroImage',
    'landingHeroTitle', config->>'landingHeroTitle',
    'companyProprietor', config->>'companyProprietor',
    'invoiceTopLogoUrl', config->>'invoiceTopLogoUrl',
    'landingAboutTitle', config->>'landingAboutTitle',
    'termsAndConditions', config->>'termsAndConditions',
    'landingHeroSubtitle', config->>'landingHeroSubtitle',
    'landingTestimonials', config->>'landingTestimonials',
    'defaultGstPercentage', config->>'defaultGstPercentage',
    'lastBuildCompletedAt', config->>'lastBuildCompletedAt',
    'lastBuildVersionCode', config->>'lastBuildVersionCode',
    'lastBuildVersionName', config->>'lastBuildVersionName',
    'invoiceBackgroundLogoUrl', config->>'invoiceBackgroundLogoUrl'
  ) AS config,
  is_active,
  trial_expires_at,
  created_at
FROM public.clients;

-- Grant SELECT on secure view to anon/authenticated
GRANT SELECT ON public.client_public TO anon, authenticated;

-- Revoke SELECT on base clients table from anon (keep service_role)
REVOKE SELECT ON public.clients FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';