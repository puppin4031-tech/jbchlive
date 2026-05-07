-- Sermon notes table
CREATE TABLE public.sermon_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sermon_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sermon_notes_has_content CHECK (
    (content IS NOT NULL AND length(trim(content)) > 0) OR image_url IS NOT NULL
  )
);

CREATE INDEX idx_sermon_notes_sermon ON public.sermon_notes(sermon_id, created_at DESC);
CREATE INDEX idx_sermon_notes_user ON public.sermon_notes(user_id);

ALTER TABLE public.sermon_notes ENABLE ROW LEVEL SECURITY;

-- Helper: is the user the channel owner of the sermon
CREATE OR REPLACE FUNCTION public.is_sermon_channel_owner_by_id(_user_id UUID, _sermon_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sermons s
    JOIN public.channels c ON c.id = s.channel_id
    WHERE s.id = _sermon_id AND c.owner_id = _user_id
  )
$$;

CREATE POLICY "Notes viewable by everyone"
  ON public.sermon_notes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can create own notes"
  ON public.sermon_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can update own notes"
  ON public.sermon_notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Author, channel owner or admin can delete"
  ON public.sermon_notes FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_sermon_channel_owner_by_id(auth.uid(), sermon_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_sermon_notes_updated
BEFORE UPDATE ON public.sermon_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for note images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sermon-notes', 'sermon-notes', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Note images publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sermon-notes');

CREATE POLICY "Users upload own note images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sermon-notes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own note images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sermon-notes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
