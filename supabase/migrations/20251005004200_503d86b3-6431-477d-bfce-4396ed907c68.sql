-- Fix 1: Add missing UPDATE policy for wishlist table
CREATE POLICY "Users can update own wishlist"
ON public.wishlist
FOR UPDATE
USING (auth.uid() = user_id);

-- Fix 2: Make wine-images bucket private and add RLS policies
-- First, update the bucket to be private
UPDATE storage.buckets
SET public = false
WHERE id = 'wine-images';

-- Add RLS policies for wine-images storage
CREATE POLICY "Users can view their own wine images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'wine-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own wine images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'wine-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own wine images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'wine-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own wine images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'wine-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Fix 3: Add ownership validation to handle_wine_archive trigger function
CREATE OR REPLACE FUNCTION public.handle_wine_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate that the user owns this wine (RLS should handle this, but adding extra check)
  IF NOT EXISTS (
    SELECT 1 FROM public.wines 
    WHERE id = NEW.id 
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You do not own this wine';
  END IF;

  -- If stock is being set to 0 and it wasn't 0 before, set archived_at
  IF NEW.current_stock = 0 AND (OLD.current_stock IS NULL OR OLD.current_stock > 0) THEN
    NEW.archived_at = NOW();
  END IF;
  
  -- If stock is being increased from 0, clear archived_at
  IF NEW.current_stock > 0 AND OLD.current_stock = 0 THEN
    NEW.archived_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$;