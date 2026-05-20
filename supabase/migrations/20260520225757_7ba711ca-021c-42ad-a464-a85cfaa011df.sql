
INSERT INTO storage.buckets (id, name, public)
VALUES ('sermon-thumbnails', 'sermon-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Sermon thumbnails are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'sermon-thumbnails');

CREATE POLICY "Authenticated users can upload sermon thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sermon-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own sermon thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sermon-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own sermon thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sermon-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
