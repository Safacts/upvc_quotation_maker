-- 046: Harden remaining RLS - drop public-all on products/audit_logs and lock rate_card_items/products to SELECT-only for anon
-- Black-hat audit 25-08-2026: products and audit_logs still had "Allow public all" (public leak), and rate_card_items/products allowed anon INSERT via header spoof.

-- Drop permissive public-all policies (OR'd with client_isolation -> bypass)
DROP POLICY IF EXISTS "Allow public all on products" ON public.products;
DROP POLICY IF EXISTS "Allow public all on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow public all on rate_card_items" ON public.rate_card_items;

-- Recreate client_isolation as SELECT-only for anon (writes via service_role API only)
-- Products
DROP POLICY IF EXISTS "client_isolation_products" ON public.products;
CREATE POLICY "client_isolation_products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- Audit logs: restrict anon to SELECT only (writes are service_role via API layer)
DROP POLICY IF EXISTS "client_isolation_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow public all on audit_logs" ON public.audit_logs;
CREATE POLICY "client_isolation_audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- Rate card items: anon SELECT only (Flutter reads directly, writes via /api/rate-card/import with service_role)
DROP POLICY IF EXISTS "client_isolation_rate_card_items" ON public.rate_card_items;
CREATE POLICY "client_isolation_rate_card_items"
  ON public.rate_card_items
  FOR SELECT
  TO anon, authenticated
  USING (client_id = current_setting('request.headers', true)::json->>'x-client-id');

-- Ensure service_role retains full access (already exists, but recreate to be idempotent)
DROP POLICY IF EXISTS "Allow service_role full access on products" ON public.products;
CREATE POLICY "Allow service_role full access on products"
  ON public.products USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access on audit_logs" ON public.audit_logs;
CREATE POLICY "Allow service_role full access on audit_logs"
  ON public.audit_logs USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access on rate_card_items" ON public.rate_card_items;
CREATE POLICY "Allow service_role full access on rate_card_items"
  ON public.rate_card_items USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
