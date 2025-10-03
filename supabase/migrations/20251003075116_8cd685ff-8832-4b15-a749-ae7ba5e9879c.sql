-- Add more columns to wishlist table for wine details
ALTER TABLE public.wishlist 
ADD COLUMN producer TEXT,
ADD COLUMN vintage_year INTEGER,
ADD COLUMN wine_type TEXT,
ADD COLUMN region TEXT,
ADD COLUMN country TEXT,
ADD COLUMN grape_varietals TEXT;