DROP POLICY IF EXISTS "Channels viewable by everyone" ON public.channels;
CREATE POLICY "Public can view active channels"
ON public.channels
FOR SELECT
TO anon, authenticated
USING (is_suspended = false);

CREATE POLICY "Owners and admins can view restricted channels"
ON public.channels
FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Sermons viewable by everyone" ON public.sermons;
CREATE POLICY "Public can view visible sermons"
ON public.sermons
FOR SELECT
TO anon, authenticated
USING (is_hidden = false);

CREATE POLICY "Owners and admins can view hidden sermons"
ON public.sermons
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = sermons.channel_id
      AND c.owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;