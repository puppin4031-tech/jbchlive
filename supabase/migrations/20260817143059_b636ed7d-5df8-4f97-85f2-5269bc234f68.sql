CREATE OR REPLACE FUNCTION public.sync_subscriber_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.sync_subscriber_count', 'on', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels
      SET subscriber_count = (SELECT count(*) FROM public.subscriptions WHERE channel_id = NEW.channel_id)
      WHERE id = NEW.channel_id;
    PERFORM set_config('app.sync_subscriber_count', 'off', true);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels
      SET subscriber_count = (SELECT count(*) FROM public.subscriptions WHERE channel_id = OLD.channel_id)
      WHERE id = OLD.channel_id;
    PERFORM set_config('app.sync_subscriber_count', 'off', true);
    RETURN OLD;
  END IF;
  PERFORM set_config('app.sync_subscriber_count', 'off', true);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_channel_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- internal subscriber-count sync (trigger-driven) may pass through
  IF coalesce(current_setting('app.sync_subscriber_count', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- service role / internal jobs (no JWT) and admins may change everything
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.is_approved := OLD.is_approved;
  NEW.is_suspended := OLD.is_suspended;
  NEW.suspended_reason := OLD.suspended_reason;
  NEW.owner_id := OLD.owner_id;
  NEW.subscriber_count := OLD.subscriber_count;
  NEW.is_live := OLD.is_live;
  NEW.live_started_at := OLD.live_started_at;
  NEW.gcp_input_uri := OLD.gcp_input_uri;
  NEW.gcp_input_id := OLD.gcp_input_id;
  NEW.gcp_channel_id := OLD.gcp_channel_id;
  NEW.gcp_channel_state := OLD.gcp_channel_state;
  NEW.gcp_output_uri := OLD.gcp_output_uri;
  NEW.gcp_provisioned_at := OLD.gcp_provisioned_at;
  NEW.gcp_last_error := OLD.gcp_last_error;
  NEW.current_viewers := OLD.current_viewers;
  NEW.peak_viewers := OLD.peak_viewers;
  RETURN NEW;
END;
$function$;

-- backfill existing counts
UPDATE public.channels c
SET subscriber_count = (SELECT count(*) FROM public.subscriptions s WHERE s.channel_id = c.id)
WHERE c.subscriber_count IS DISTINCT FROM (SELECT count(*) FROM public.subscriptions s WHERE s.channel_id = c.id);