ALTER TABLE public.wines ADD COLUMN IF NOT EXISTS domain_description text;
ALTER TABLE public.wishlist ADD COLUMN IF NOT EXISTS domain_description text;