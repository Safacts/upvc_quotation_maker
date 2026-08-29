-- 052: Fix client_public view security context
-- Sets security_invoker = false so that anon can query public branding data without needing raw SELECT on public.clients table.

ALTER VIEW public.client_public SET (security_invoker = false);

GRANT SELECT ON public.client_public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
