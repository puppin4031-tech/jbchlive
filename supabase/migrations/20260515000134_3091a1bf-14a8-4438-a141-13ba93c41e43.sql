
-- 1. Channel lifecycle notification function
CREATE OR REPLACE FUNCTION public.notify_channel_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
  v_owner uuid;
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_approved = false THEN
      FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_admin.user_id, 'channel_request', '새 채널 개설 요청',
                NEW.name, '/admin', NEW.id);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_owner := OLD.owner_id;
    v_name := OLD.name;
    IF v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_owner, 'channel_deleted', '채널이 삭제되었습니다', v_name, NULL, OLD.id);
    END IF;
    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      IF v_admin.user_id IS DISTINCT FROM v_owner THEN
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_admin.user_id, 'channel_deleted', '채널이 삭제되었습니다', v_name, '/admin', OLD.id);
      END IF;
    END LOOP;
    RETURN OLD;
  END IF;

  -- UPDATE
  v_owner := NEW.owner_id;
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    IF NEW.is_approved = true THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_owner, 'channel_approved', '채널이 승인되었습니다',
              NEW.name || ' 채널이 승인되어 송출이 가능합니다',
              '/my-channel', NEW.id);
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_owner, 'channel_unapproved', '채널 승인이 취소되었습니다',
              NEW.name, '/my-channel', NEW.id);
    END IF;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF NEW.is_suspended = true THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_owner, 'channel_suspended', '채널이 정지되었습니다',
              COALESCE('사유: ' || NEW.suspended_reason, NEW.name),
              '/channel/' || NEW.id, NEW.id);
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_owner, 'channel_unsuspended', '채널 정지가 해제되었습니다',
              NEW.name, '/channel/' || NEW.id, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channels_lifecycle_iud ON public.channels;
CREATE TRIGGER trg_channels_lifecycle_iud
AFTER INSERT OR UPDATE OR DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.notify_channel_lifecycle();


-- 2. Live stream lifecycle notification function
CREATE OR REPLACE FUNCTION public.notify_live_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
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

  -- Live started
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
  END IF;

  -- Live error: takes precedence over plain stop
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
    -- Plain stop only when no new error
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (v_owner, 'live_stopped', '라이브가 종료되었습니다', NEW.name,
            '/my-channel', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channels_live_lifecycle ON public.channels;
CREATE TRIGGER trg_channels_live_lifecycle
AFTER UPDATE OF is_live, gcp_last_error ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.notify_live_lifecycle();
