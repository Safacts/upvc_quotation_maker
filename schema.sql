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
    client_id TEXT,
    supplier_company TEXT DEFAULT '',
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
    client_id TEXT DEFAULT 'venkateshwara' NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for Unmeasured Items
CREATE TABLE IF NOT EXISTS public.unmeasured_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    description TEXT,
    units INTEGER DEFAULT 1,
    rate NUMERIC DEFAULT 0,
    client_id TEXT DEFAULT 'venkateshwara' NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.admins (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
);

INSERT INTO public.admins (email, password_hash)
VALUES ('jvenkateshupvc@gmail.com', '7553830073163f0955b6d8a9671f0375c69ae7d12b6f73a3a23dffd1e1b522ed')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.admins (email, password_hash)
VALUES ('kongaaadisheshu@gmail.com', 'bce841c5e962ba515b6e1c938b540c87a03a076b5999312993beccdf6492d645')
ON CONFLICT (email) DO NOTHING;