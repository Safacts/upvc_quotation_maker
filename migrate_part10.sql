-- Part 10: Secure client_public view to prevent password leaks

-- Recreate the client_public view but explicitly strip portalPasswordHash from the config jsonb
CREATE OR REPLACE VIEW client_public AS
SELECT 
    id, 
    config - 'portalPasswordHash' AS config, 
    trial_expires_at, 
    is_active, 
    created_at, 
    updated_at, 
    cost_margin_percent
FROM clients 
WHERE is_active = true;

-- Grant permissions again just to be safe
GRANT SELECT ON client_public TO anon, authenticated;
