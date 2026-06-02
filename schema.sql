-- Create sequences for quotation numbering
CREATE SEQUENCE IF NOT EXISTS quotation_no_seq START 1;

-- Table for Quotations
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_no TEXT UNIQUE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name TEXT NOT NULL,
    reference TEXT,
    address TEXT,
    contact_no TEXT,
    email TEXT,
    status TEXT DEFAULT 'Draft',
    transport_cost NUMERIC DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for Measured Items
CREATE TABLE IF NOT EXISTS public.measured_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    code TEXT,
    description TEXT,
    width NUMERIC DEFAULT 0,
    height NUMERIC DEFAULT 0,
    units INTEGER DEFAULT 1,
    glass TEXT,
    rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for Unmeasured Items
CREATE TABLE IF NOT EXISTS public.unmeasured_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    description TEXT,
    units INTEGER DEFAULT 1,
    rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to safely generate the next quotation number
CREATE OR REPLACE FUNCTION public.get_next_quote_number()
RETURNS TEXT AS $$
DECLARE
    next_val INT;
    date_part TEXT;
BEGIN
    next_val := nextval('quotation_no_seq');
    date_part := to_char(CURRENT_DATE, 'DDMMYYYY');
    RETURN 'JVUPVC-' || date_part || '-' || lpad(next_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.sent_emails (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL
);