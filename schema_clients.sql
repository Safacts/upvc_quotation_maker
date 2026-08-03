-- Clients table for multi-tenant config management
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,                          -- "venkateshwara", "client_a", etc.
    config JSONB NOT NULL DEFAULT '{}',           -- All branding fields (see ClientConfig model)
    trial_expires_at TIMESTAMPTZ,                 -- NULL = no trial, otherwise trial end date
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Function to update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert Venkateshwara as default client
INSERT INTO public.clients (id, config, is_active)
VALUES ('venkateshwara', '{
    "appName": "Venkateshwara UPVC Quote",
    "companyName": "Venkateshwara UPVC Windows & Doors",
    "companyAddress": "Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074",
    "companyContact": "9246588692, 9441888131",
    "companyEmail": "jvenkateshupvc@gmail.com",
    "companyProprietor": "J.Venkateshwarlu",
    "gstNumber": "36AKDPJ7245B2ZF",
    "bankName": "VENKATESHWARA WELDING WORKS",
    "bankBranch": "Union Bank, Hastinapuram",
    "bankAccountNo": "A/C No : 178511100000061",
    "bankIfsc": "IFSC Code : UBIN0817856",
    "termsAndConditions": ["50% advance, 35% after dispatch, 15% after installation.", "Delivery minimum 15 days from advance.", "All payments in favor of M/s Niksha Industries Pvt Ltd.", "Client responsible for site safety & electricity.", "Material can be taken back if payment not received.", "Final wall-to-wall measurement includes silicone sealant.", "Rates may alter if size changes above 1 foot.", "Quotation valid for 15 days.", "Above rates inclusive of installation."],
    "defaultGstPercentage": 18.0,
    "quotePrefix": "JVUPVC",
    "logoUrl": "",
    "primaryColor": 6513505,
    "accentColor": 15508377,
    "adminEmails": ["jvenkateshupvc@gmail.com", "kongaaadisheshu@gmail.com"]
}', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Allow public read for active clients (for app bootstrap)
CREATE POLICY "Allow public read active clients"
    ON public.clients
    FOR SELECT
    USING (is_active = true);

-- Only admins can manage clients (via admin panel)
CREATE POLICY "Allow admin full access"
    ON public.clients
    USING (auth.role() = 'service_role');
