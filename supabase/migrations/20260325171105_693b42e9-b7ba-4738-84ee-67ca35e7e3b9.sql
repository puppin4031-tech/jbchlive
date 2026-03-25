
-- 1. Create a separate table for stream keys (owner-only access)
CREATE TABLE public.channel_stream_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL UNIQUE REFERENCES public.channels(id) ON DELETE CASCADE,
  stream_key text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_stream_keys ENABLE ROW LEVEL SECURITY;

-- Only channel owners and admins can read stream keys
CREATE POLICY "Owners can read own stream key"
ON public.channel_stream_keys FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.channels WHERE channels.id = channel_stream_keys.channel_id AND channels.owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- Only channel owners and admins can insert
CREATE POLICY "Owners can insert stream key"
ON public.channel_stream_keys FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.channels WHERE channels.id = channel_stream_keys.channel_id AND channels.owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- Only channel owners and admins can update
CREATE POLICY "Owners can update stream key"
ON public.channel_stream_keys FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.channels WHERE channels.id = channel_stream_keys.channel_id AND channels.owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- 2. Migrate existing stream_key data
INSERT INTO public.channel_stream_keys (channel_id, stream_key)
SELECT id, stream_key FROM public.channels WHERE stream_key IS NOT NULL
ON CONFLICT (channel_id) DO NOTHING;

-- 3. Remove stream_key from channels table
ALTER TABLE public.channels DROP COLUMN stream_key;

-- 4. Drop old policies and replace with clean ones
DROP POLICY IF EXISTS "Anon can only read non-sensitive channel data" ON public.channels;
DROP POLICY IF EXISTS "Authenticated can read channels" ON public.channels;

-- Channels are publicly readable (now safe, no stream_key)
CREATE POLICY "Channels viewable by everyone"
ON public.channels FOR SELECT
TO public
USING (true);

-- 5. Drop the view (no longer needed since stream_key is removed)
DROP VIEW IF EXISTS public.channels_public;
