-- Add archived_at column to track when wines reach zero stock
ALTER TABLE public.wines 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Create function to automatically set archived_at when stock reaches zero
CREATE OR REPLACE FUNCTION public.handle_wine_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- Create trigger to call the function
DROP TRIGGER IF EXISTS wine_archive_trigger ON public.wines;
CREATE TRIGGER wine_archive_trigger
  BEFORE UPDATE OF current_stock ON public.wines
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_wine_archive();

-- Add comment to explain the column
COMMENT ON COLUMN public.wines.archived_at IS 'Timestamp when wine stock reached zero and was moved to archive';

-- Create index for efficient archive queries
CREATE INDEX IF NOT EXISTS idx_wines_archived_at ON public.wines(archived_at) WHERE archived_at IS NOT NULL;