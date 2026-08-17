-- community-images
CREATE POLICY "community_images_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'community-images');

CREATE POLICY "community_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "community_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'community-images'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.has_role(auth.uid(), 'admin'::app_role)));

-- community-files
CREATE POLICY "community_files_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'community-files');

CREATE POLICY "community_files_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "community_files_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'community-files'
         AND ((storage.foldername(name))[1] = auth.uid()::text
              OR public.has_role(auth.uid(), 'admin'::app_role)));