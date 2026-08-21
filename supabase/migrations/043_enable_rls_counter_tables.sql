-- Close anon/authenticated exposure on counter tables (Supabase security advisory).
-- Applied to production on 2026-08-20. These tables are reached only via SECURITY
-- DEFINER RPCs (get_next_quote_number, get_next_gst_invoice_number,
-- get_next_vitharn_invoice_number) and service_role, both of which bypass RLS,
-- so enabling RLS does not affect quote/invoice numbering.
ALTER TABLE public.gst_invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_counters  ENABLE ROW LEVEL SECURITY;
