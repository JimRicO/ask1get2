-- Update wishlist table to support multiple images and additional fields
-- 1. Add new fields for images (jsonb), description, and notes
ALTER TABLE public.wishlist 
  ADD COLUMN IF NOT EXISTS images jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Migrate existing image_url data to new images jsonb format
UPDATE public.wishlist
SET images = jsonb_build_object('front', image_url)
WHERE image_url IS NOT NULL AND images IS NULL;

-- 3. Drop the old image_url column (no longer needed)
ALTER TABLE public.wishlist 
  DROP COLUMN IF EXISTS image_url;