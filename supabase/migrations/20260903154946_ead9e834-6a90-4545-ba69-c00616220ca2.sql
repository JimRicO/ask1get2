ALTER TABLE public.wines ADD COLUMN IF NOT EXISTS description_sources text[];
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS description_sources text[];