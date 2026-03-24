-- Allow channel owners to update their own channels
CREATE POLICY "Owners can update own channels"
ON public.channels FOR UPDATE TO authenticated
USING (owner_id = auth.uid());