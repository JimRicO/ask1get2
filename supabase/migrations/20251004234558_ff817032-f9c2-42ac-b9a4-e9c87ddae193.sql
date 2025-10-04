-- Fix duplicate Chenin Blanc in grape_varietals (normalize to "Chenin Blanc")
UPDATE wines
SET grape_varietals = (
  SELECT jsonb_agg(DISTINCT 
    CASE 
      WHEN elem::text ILIKE '%"chenin blanc"%' THEN '"Chenin Blanc"'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(grape_varietals) elem
)
WHERE grape_varietals::text ILIKE '%chenin%';

-- Normalize all country values to title case (e.g., "South Africa" instead of "SOUTH AFRICA")
UPDATE wines
SET country = INITCAP(country)
WHERE country IS NOT NULL;