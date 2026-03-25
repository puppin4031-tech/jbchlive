
-- Allow channel owners to insert sermons for their own channels
CREATE POLICY "Owners can insert sermons"
ON public.sermons
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE channels.id = sermons.channel_id
    AND channels.owner_id = auth.uid()
  )
);

-- Allow channel owners to update sermons for their own channels
CREATE POLICY "Owners can update own sermons"
ON public.sermons
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE channels.id = sermons.channel_id
    AND channels.owner_id = auth.uid()
  )
);

-- Allow channel owners to delete sermons for their own channels
CREATE POLICY "Owners can delete own sermons"
ON public.sermons
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE channels.id = sermons.channel_id
    AND channels.owner_id = auth.uid()
  )
);
