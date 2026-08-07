-- Enable RLS on core quotation tables
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measured_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unmeasured_items ENABLE ROW LEVEL SECURITY;

-- The Flutter app connects using the anon key without user authentication.
-- To prevent breaking the Flutter app while we transition to a secure architecture,
-- we must temporarily allow all operations via the anon role.
-- WARNING: This leaves the tables vulnerable to unauthenticated REST API access.
-- This is a temporary measure until the Flutter app is updated to use authenticated sessions.

CREATE POLICY "Allow public all on quotations"
    ON public.quotations
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public all on measured_items"
    ON public.measured_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public all on unmeasured_items"
    ON public.unmeasured_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Allow service_role full access (for the Next.js API)
CREATE POLICY "Allow service_role full access on quotations"
    ON public.quotations
    USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on measured_items"
    ON public.measured_items
    USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on unmeasured_items"
    ON public.unmeasured_items
    USING (auth.role() = 'service_role');
