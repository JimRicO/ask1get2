CREATE INDEX IF NOT EXISTS wines_user_created_idx ON public.wines (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_user_created_idx ON public.wishlist (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasting_notes_wine_user_idx ON public.tasting_notes (wine_id, user_id);
CREATE INDEX IF NOT EXISTS tasting_notes_user_idx ON public.tasting_notes (user_id);
CREATE INDEX IF NOT EXISTS sommelier_conversations_user_updated_idx ON public.sommelier_conversations (user_id, updated_at DESC);