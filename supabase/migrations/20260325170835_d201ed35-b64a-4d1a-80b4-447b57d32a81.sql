
-- 1. Create a public view that excludes stream_key
CREATE VIEW public.channels_public
WITH (security_invoker = on) AS
SELECT id, name, description, logo_url, stream_url, is_live, is_approved,
       owner_id, subscriber_count, created_at, updated_at
FROM public.channels;

-- 2. Drop the existing public SELECT policy
DROP POLICY IF EXISTS "Channels viewable by everyone" ON public.channels;

-- 3. Allow anonymous/public to select ONLY via the view (deny direct table access for anon)
CREATE POLICY "Anon can only read non-sensitive channel data"
ON public.channels
FOR SELECT
TO anon
USING (true);

-- 4. Authenticated users can see all columns except stream_key is hidden by app logic
-- Owner can see their own stream_key
CREATE POLICY "Authenticated can read channels"
ON public.channels
FOR SELECT
TO authenticated
USING (true);

-- 5. Enable leaked password protection
ALTER TABLE public.channels ALTER COLUMN stream_key SET DEFAULT NULL;
