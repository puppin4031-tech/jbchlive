-- Storage bucket for channel logos
INSERT INTO storage.buckets (id, name, public) VALUES ('channel-logos', 'channel-logos', true);

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'channel-logos');

-- Anyone can view logos (public bucket)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'channel-logos');

-- Users can delete their own uploads
CREATE POLICY "Users can delete own logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'channel-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow any authenticated user to insert channels (pending approval)
DROP POLICY IF EXISTS "Admins can insert channels" ON public.channels;
CREATE POLICY "Authenticated users can create channels"
ON public.channels FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());
