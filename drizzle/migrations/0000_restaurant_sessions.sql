CREATE TABLE public.restaurant_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  restaurant_name text,
  dishes_text text,
  menu_images text[] NOT NULL DEFAULT '{}',
  wine_list_images text[] NOT NULL DEFAULT '{}',
  menu_dishes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordered_dishes jsonb NOT NULL DEFAULT '[]'::jsonb,
  wine_list_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb,
  loved_wines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_sessions TO authenticated;
GRANT ALL ON public.restaurant_sessions TO service_role;
ALTER TABLE public.restaurant_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own restaurant sessions select" ON public.restaurant_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own restaurant sessions insert" ON public.restaurant_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own restaurant sessions update" ON public.restaurant_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own restaurant sessions delete" ON public.restaurant_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX restaurant_sessions_user_created_idx ON public.restaurant_sessions (user_id, created_at DESC);
CREATE TRIGGER update_restaurant_sessions_updated_at BEFORE UPDATE ON public.restaurant_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();