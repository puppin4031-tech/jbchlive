CREATE OR REPLACE FUNCTION public.live_tick_needed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels
    WHERE is_live = true
       OR gcp_channel_state IN ('STARTING', 'RUNNING', 'STOPPING', 'AWAITING_INPUT')
       OR (scheduled_start_at IS NOT NULL AND scheduled_start_at <= now() + INTERVAL '2 minutes')
  )
$$;

REVOKE ALL ON FUNCTION public.live_tick_needed() FROM anon, authenticated;