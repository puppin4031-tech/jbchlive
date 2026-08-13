-- Move profile PII into a self-only table, restore simple display-name visibility
CREATE TABLE IF NOT EXISTS public.profile_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  church_name text,
  position text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_details TO authenticated;
GRANT ALL ON public.profile_details TO service_role;

ALTER TABLE public.profile_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile details"
ON public.profile_details FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own profile details"
ON public.profile_details FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile details"
ON public.profile_details FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own profile details"
ON public.profile_details FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_profile_details_updated_at
BEFORE UPDATE ON public.profile_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.profile_details (user_id, church_name, position)
SELECT user_id, church_name, position FROM public.profiles
WHERE church_name IS NOT NULL OR position IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN church_name;
ALTER TABLE public.profiles DROP COLUMN position;

DROP VIEW IF EXISTS public.public_profiles;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Revoke leftover PUBLIC execute rights on internal-only functions
REVOKE EXECUTE ON FUNCTION public.gc_realtime_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_channel_lifecycle() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_live_lifecycle() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_new_ticket() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_ticket_reply() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_ticket_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_subscriber_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_sermon_urls() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_stream_url() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_channel_privileged_columns() FROM PUBLIC;