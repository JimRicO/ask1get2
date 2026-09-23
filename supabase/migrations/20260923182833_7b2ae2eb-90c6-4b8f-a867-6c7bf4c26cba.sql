DROP POLICY IF EXISTS "Anyone can view wine images" ON storage.objects;

CREATE POLICY "Users can view own wine images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'wine-images' AND owner_id = (select auth.uid()::text));