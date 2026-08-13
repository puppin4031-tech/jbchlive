-- 1) RTMP ingest URI -> owner-only table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_stream_keys TO authenticated;
GRANT ALL ON public.channel_stream_keys TO service_role;

INSERT INTO public.channel_stream_keys (channel_id, stream_key)
SELECT id, gcp_input_uri FROM public.channels WHERE gcp_input_uri IS NOT NULL
ON CONFLICT (channel_id) DO UPDATE SET stream_key = EXCLUDED.stream_key;

CREATE OR REPLACE FUNCTION public.get_channel_rtmp(_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT k.stream_key
  FROM public.channel_stream_keys k
  JOIN public.channels c ON c.id = k.channel_id
  WHERE k.channel_id = _channel_id
    AND (
      c.owner_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
$$;

-- 2) Prevent privilege escalation through channel updates
CREATE OR REPLACE FUNCTION public.protect_channel_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
$$;

DROP TRIGGER IF EXISTS trg_protect_channel_columns ON public.channels;
CREATE TRIGGER trg_protect_channel_columns
BEFORE UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.protect_channel_privileged_columns();

-- now that the secret lives elsewhere, clear it from the publicly readable table
UPDATE public.channels SET gcp_input_uri = NULL WHERE gcp_input_uri IS NOT NULL;

-- 3) Profile PII: only self/admin can read full rows; public display fields via view
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
CREATE POLICY "Users read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = off) AS
SELECT user_id, display_name, avatar_url FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 4) Revoke client EXECUTE on internal-only definer functions
REVOKE EXECUTE ON FUNCTION public.gc_realtime_tables() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_channel_lifecycle() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_live_lifecycle() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_new_ticket() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_ticket_reply() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_ticket_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_subscriber_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_sermon_urls() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_stream_url() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_channel_privileged_columns() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_report(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_ticket(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_sermon_channel_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_sermon_channel_owner_by_id(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_channel_rtmp(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;