-- Part 10: Secure client_public view to prevent password leaks

-- Drop the view first to avoid column order mismatch errors
DROP VIEW IF EXISTS client_public;

-- Recreate the client_public view but explicitly strip portalPasswordHash from the config jsonb
CREATE VIEW client_public AS
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
