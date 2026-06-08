
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

GRANT SELECT, INSERT, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own subscriptions"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own subscriptions"
  ON public.subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_subscriptions_channel ON public.subscriptions(channel_id);
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);

-- Trigger to keep channels.subscriber_count in sync
CREATE OR REPLACE FUNCTION public.sync_subscriber_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels
      SET subscriber_count = subscriber_count + 1
      WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels
      SET subscriber_count = GREATEST(subscriber_count - 1, 0)
      WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_subscriber_count_ins
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscriber_count();

CREATE TRIGGER trg_sync_subscriber_count_del
  AFTER DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscriber_count();

-- Extend live lifecycle notifications to subscribers
CREATE OR REPLACE FUNCTION public.notify_live_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin RECORD;
  v_sub RECORD;
  v_owner uuid := NEW.owner_id;
  v_err_changed boolean := (NEW.gcp_last_error IS DISTINCT FROM OLD.gcp_last_error)
                            AND NEW.gcp_last_error IS NOT NULL;
  v_started boolean := (NEW.is_live IS DISTINCT FROM OLD.is_live) AND NEW.is_live = true;
  v_stopped boolean := (NEW.is_live IS DISTINCT FROM OLD.is_live) AND NEW.is_live = false;
  v_err_short text;
BEGIN
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_started THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (v_owner, 'live_started', '라이브가 시작되었습니다', NEW.name,
            '/live/' || NEW.id, NEW.id);
    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      IF v_admin.user_id IS DISTINCT FROM v_owner THEN
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_admin.user_id, 'live_started', '라이브 시작', NEW.name,
                '/live/' || NEW.id, NEW.id);
      END IF;
    END LOOP;
    -- Notify subscribers
    FOR v_sub IN SELECT user_id FROM public.subscriptions WHERE channel_id = NEW.id LOOP
      IF v_sub.user_id IS DISTINCT FROM v_owner THEN
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_sub.user_id, 'live_started', '구독한 채널이 라이브 중입니다', NEW.name,
                '/live/' || NEW.id, NEW.id);
      END IF;
    END LOOP;
  END IF;

  IF v_err_changed THEN
    v_err_short := left(NEW.gcp_last_error, 160);
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (v_owner, 'live_error', '라이브 송출 오류', v_err_short,
            '/my-channel', NEW.id);
    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      IF v_admin.user_id IS DISTINCT FROM v_owner THEN
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_admin.user_id, 'live_error', '라이브 오류 (' || NEW.name || ')',
                v_err_short, '/admin', NEW.id);
      END IF;
    END LOOP;
  ELSIF v_stopped THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (v_owner, 'live_stopped', '라이브가 종료되었습니다', NEW.name,
            '/my-channel', NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;
