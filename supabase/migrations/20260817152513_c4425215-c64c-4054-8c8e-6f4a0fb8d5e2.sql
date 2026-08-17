-- 1) Create a dedicated cron secret in the vault
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_SECRET';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'CRON_SECRET', 'Shared secret for pg_cron -> edge function calls');
  END IF;
END $$;

-- 2) Verifier callable only by service_role (edge function uses this via RPC)
CREATE OR REPLACE FUNCTION public.verify_cron_secret(_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET' AND decrypted_secret = _secret
  )
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- 3) Re-register cron jobs with the new secret
DO $$
DECLARE
  j record;
  v_url text := 'https://nhdopijdmrowknwqouxw.supabase.co/functions/v1/live-stream';
BEGIN
  FOR j IN SELECT jobname, jobid FROM cron.job WHERE command LIKE '%live-stream%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  PERFORM cron.schedule('live-auto-stop-idle', '30 seconds', format($f$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)),
      body := jsonb_build_object('action','autoStopIdleChannels')
    );
  $f$, v_url));

  PERFORM cron.schedule('live-scheduled-start', '* * * * *', format($f$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)),
      body := jsonb_build_object('action','scheduledStartChannels')
    );
  $f$, v_url));

  PERFORM cron.schedule('live-scheduled-stop', '* * * * *', format($f$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)),
      body := jsonb_build_object('action','scheduledStopChannels')
    );
  $f$, v_url));

  PERFORM cron.schedule('live-sample-viewers', '* * * * *', format($f$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)),
      body := jsonb_build_object('action','sampleLiveViewers')
    );
  $f$, v_url));
END $$;

-- 4) Max broadcast duration default -> 180 minutes
ALTER TABLE public.channels ALTER COLUMN auto_stop_max_minutes SET DEFAULT 180;
UPDATE public.channels SET auto_stop_max_minutes = 180 WHERE auto_stop_max_minutes IS DISTINCT FROM 180;