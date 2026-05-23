
ALTER TABLE public.support_ticket_replies
  ADD CONSTRAINT chk_str_author_role CHECK (author_role IN ('admin','user'));

ALTER TABLE public.sermon_report_replies
  ADD CONSTRAINT chk_srr_author_role CHECK (author_role IN ('admin','owner','user'));

DROP POLICY IF EXISTS "Participants post replies" ON public.support_ticket_replies;
CREATE POLICY "Participants post replies"
ON public.support_ticket_replies
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND can_access_ticket(auth.uid(), ticket_id)
  AND (
    (author_role = 'admin' AND has_role(auth.uid(), 'admin'::app_role))
    OR (author_role = 'user' AND NOT has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Participants can post replies" ON public.sermon_report_replies;
CREATE POLICY "Participants can post replies"
ON public.sermon_report_replies
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND can_access_report(auth.uid(), report_id)
  AND (
    (author_role = 'admin' AND has_role(auth.uid(), 'admin'::app_role))
    OR (author_role = 'owner' AND EXISTS (
      SELECT 1 FROM public.sermon_reports r
      WHERE r.id = sermon_report_replies.report_id
        AND is_sermon_channel_owner(auth.uid(), r.sermon_id)
    ))
    OR (author_role = 'user'
        AND NOT has_role(auth.uid(), 'admin'::app_role)
        AND NOT EXISTS (
          SELECT 1 FROM public.sermon_reports r
          WHERE r.id = sermon_report_replies.report_id
            AND is_sermon_channel_owner(auth.uid(), r.sermon_id)
        ))
  )
);
