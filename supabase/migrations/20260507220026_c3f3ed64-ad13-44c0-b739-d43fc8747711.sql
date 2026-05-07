
-- 1. Tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or admin update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete tickets" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper: ticket access
CREATE OR REPLACE FUNCTION public.can_access_ticket(_user_id UUID, _ticket_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = _ticket_id
      AND (t.user_id = _user_id OR has_role(_user_id, 'admin'::app_role))
  )
$$;

-- 3. Replies
CREATE TABLE public.support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'user',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view replies" ON public.support_ticket_replies
  FOR SELECT TO authenticated
  USING (can_access_ticket(auth.uid(), ticket_id));

CREATE POLICY "Participants post replies" ON public.support_ticket_replies
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND can_access_ticket(auth.uid(), ticket_id));

CREATE POLICY "Admins delete replies" ON public.support_ticket_replies
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  related_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- No INSERT policy: only triggers (SECURITY DEFINER) create notifications.

-- 5. Trigger: on new reply -> notify the other party
CREATE OR REPLACE FUNCTION public.notify_on_ticket_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket RECORD;
  v_admin RECORD;
BEGIN
  SELECT id, user_id, subject INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NEW.author_role = 'admin' THEN
    -- notify ticket owner
    IF v_ticket.user_id <> NEW.author_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_ticket.user_id, 'ticket_reply', '문의에 답변이 도착했습니다', v_ticket.subject,
              '/support/' || v_ticket.id, v_ticket.id);
    END IF;
  ELSE
    -- notify all admins
    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      IF v_admin.user_id <> NEW.author_id THEN
        INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
        VALUES (v_admin.user_id, 'ticket_reply', '새 문의 답글', v_ticket.subject,
                '/admin/support/' || v_ticket.id, v_ticket.id);
      END IF;
    END LOOP;
    -- bump ticket updated_at
    UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_on_ticket_reply
  AFTER INSERT ON public.support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_ticket_reply();

-- 6. Trigger: on new ticket -> notify all admins
CREATE OR REPLACE FUNCTION public.notify_on_new_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin RECORD;
BEGIN
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (v_admin.user_id, 'ticket_new', '새 문의가 등록되었습니다', NEW.subject,
            '/admin/support/' || NEW.id, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_on_new_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_ticket();

-- 7. Trigger: on status change -> notify ticket owner
CREATE OR REPLACE FUNCTION public.notify_on_ticket_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (NEW.user_id, 'ticket_status', '문의 상태가 변경되었습니다',
            NEW.subject || ' → ' || NEW.status,
            '/support/' || NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_on_ticket_status
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_ticket_status();

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
