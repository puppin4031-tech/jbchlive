-- Cleanup function: removes stale ephemeral viewer data
CREATE OR REPLACE FUNCTION public.gc_realtime_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove viewer_presence rows not seen in last 5 minutes
  DELETE FROM public.viewer_presence
  WHERE last_seen_at < now() - INTERVAL '5 minutes';

  -- Remove per-minute viewer samples older than 30 days
  -- (live_sessions summary rows with peak/avg are preserved)
  DELETE FROM public.live_viewer_samples
  WHERE sampled_at < now() - INTERVAL '30 days';
END;
$$;

-- Unschedule previous versions if they exist (safe no-op otherwise)
DO $$
BEGIN
  PERFORM cron.unschedule('gc-viewer-presence');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('gc-live-viewer-samples');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: prune stale presence every minute
SELECT cron.schedule(
  'gc-viewer-presence',
  '* * * * *',
  $$ DELETE FROM public.viewer_presence WHERE last_seen_at < now() - INTERVAL '5 minutes'; $$
);

-- Schedule: prune old viewer samples daily at 03:00
SELECT cron.schedule(
  'gc-live-viewer-samples',
  '0 3 * * *',
  $$ DELETE FROM public.live_viewer_samples WHERE sampled_at < now() - INTERVAL '30 days'; $$
);