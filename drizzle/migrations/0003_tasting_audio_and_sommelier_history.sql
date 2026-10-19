ALTER TABLE public.tasting_notes ADD COLUMN audio_path text, ADD COLUMN transcript text;

CREATE POLICY "Own tasting audio select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tasting-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Own tasting audio insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tasting-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Own tasting audio delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tasting-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE public.sommelier_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sommelier_conversations TO authenticated;
GRANT ALL ON public.sommelier_conversations TO service_role;
ALTER TABLE public.sommelier_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own sommelier conversations" ON public.sommelier_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER sommelier_conversations_updated BEFORE UPDATE ON public.sommelier_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();