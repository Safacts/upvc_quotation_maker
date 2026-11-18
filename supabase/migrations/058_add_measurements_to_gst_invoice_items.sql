-- Add measurement fields to gst_invoice_items for KPR UPVC
-- Width, Height in MM, Units count (like regular quotation measured items)

ALTER TABLE IF EXISTS gst_invoice_items
ADD COLUMN IF NOT EXISTS width numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS height numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS units integer NOT NULL DEFAULT 1;

-- Update existing rows to have default values for new columns
UPDATE gst_invoice_items 
SET width = CASE 
  WHEN unit = 'SFT' THEN 914.4 -- 3ft in mm (approx 3x304.8 = 914.4)
  ELSE 0 
END,
height = CASE 
  WHEN unit = 'SFT' THEN 914.4 -- 3ft in mm
  ELSE 0 
END,
units = 1
WHERE width = 0 AND height = 0;