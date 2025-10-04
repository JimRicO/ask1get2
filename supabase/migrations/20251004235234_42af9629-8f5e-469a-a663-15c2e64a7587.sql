-- Add storage_locations column to track multiple locations with quantities
ALTER TABLE wines
ADD COLUMN storage_locations JSONB DEFAULT '[]'::jsonb;

-- Create an index for better performance when querying storage locations
CREATE INDEX idx_wines_storage_locations ON wines USING gin(storage_locations);

-- Migrate existing data: convert single storage_location to the new format
UPDATE wines
SET storage_locations = 
  CASE 
    WHEN storage_location IS NOT NULL THEN 
      jsonb_build_array(
        jsonb_build_object(
          'location', storage_location,
          'quantity', current_stock
        )
      )
    ELSE '[]'::jsonb
  END
WHERE storage_location IS NOT NULL;