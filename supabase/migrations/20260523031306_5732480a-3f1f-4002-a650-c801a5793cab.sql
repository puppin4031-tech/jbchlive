
DROP POLICY IF EXISTS "Notes viewable by everyone" ON public.sermon_notes;
CREATE POLICY "Notes viewable by authenticated users"
  ON public.sermon_notes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'channel-logos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users can update own logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'channel-logos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

REVOKE SELECT (gcp_input_uri) ON public.channels FROM anon;
REVOKE SELECT (gcp_input_uri) ON public.channels FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_channel_rtmp(_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.gcp_input_uri
  FROM public.channels c
  WHERE c.id = _channel_id
    AND (
      c.owner_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_channel_rtmp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_channel_rtmp(uuid) TO authenticated;

-- viewer_presence: no SELECT policy needed; presence is write-only from clients
-- and aggregated counts come via Realtime Presence channel, not table SELECTs.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_ticket(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_report(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sermon_channel_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sermon_channel_owner_by_id(uuid, uuid) FROM PUBLIC, anon;
