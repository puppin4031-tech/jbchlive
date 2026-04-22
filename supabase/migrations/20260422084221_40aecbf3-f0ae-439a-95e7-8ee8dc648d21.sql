-- 1. Channel suspension columns
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS suspended_reason text;

-- 2. Sermon hidden columns
ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.sermons ADD COLUMN IF NOT EXISTS hidden_reason text;

-- 3. Sermon reports table
CREATE TABLE IF NOT EXISTS public.sermon_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sermon_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'open',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sermon_reports_sermon ON public.sermon_reports(sermon_id);
CREATE INDEX IF NOT EXISTS idx_sermon_reports_status ON public.sermon_reports(status);
CREATE INDEX IF NOT EXISTS idx_sermon_reports_reporter ON public.sermon_reports(reporter_id);

ALTER TABLE public.sermon_reports ENABLE ROW LEVEL SECURITY;

-- Helper: is the user the channel owner of the sermon being reported?
CREATE OR REPLACE FUNCTION public.is_sermon_channel_owner(_user_id uuid, _sermon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sermons s
    JOIN public.channels c ON c.id = s.channel_id
    WHERE s.id = _sermon_id AND c.owner_id = _user_id
  )
$$;

-- SELECT: reporter, channel owner, admin
CREATE POLICY "Reports viewable by reporter, owner, admin"
ON public.sermon_reports FOR SELECT
TO authenticated
USING (
  reporter_id = auth.uid()
  OR public.is_sermon_channel_owner(auth.uid(), sermon_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- INSERT: any authenticated user, must be themselves
CREATE POLICY "Authenticated users can create reports"
ON public.sermon_reports FOR INSERT
TO authenticated
WITH CHECK (reporter_id = auth.uid());

-- UPDATE: channel owner (status change/admin_note) + admin
CREATE POLICY "Owners and admins can update reports"
ON public.sermon_reports FOR UPDATE
TO authenticated
USING (
  public.is_sermon_channel_owner(auth.uid(), sermon_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- DELETE: admin only
CREATE POLICY "Admins can delete reports"
ON public.sermon_reports FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sermon_reports_updated_at
BEFORE UPDATE ON public.sermon_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Sermon report replies table
CREATE TABLE IF NOT EXISTS public.sermon_report_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.sermon_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_role text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sermon_report_replies_report ON public.sermon_report_replies(report_id);

ALTER TABLE public.sermon_report_replies ENABLE ROW LEVEL SECURITY;

-- Helper: can user access a given report?
CREATE OR REPLACE FUNCTION public.can_access_report(_user_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sermon_reports r
    WHERE r.id = _report_id
      AND (
        r.reporter_id = _user_id
        OR public.is_sermon_channel_owner(_user_id, r.sermon_id)
        OR public.has_role(_user_id, 'admin'::app_role)
      )
  )
$$;

CREATE POLICY "Replies viewable by report participants"
ON public.sermon_report_replies FOR SELECT
TO authenticated
USING (public.can_access_report(auth.uid(), report_id));

CREATE POLICY "Participants can post replies"
ON public.sermon_report_replies FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.can_access_report(auth.uid(), report_id)
);

CREATE POLICY "Admins can delete replies"
ON public.sermon_report_replies FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Update public visibility policies

-- Sermons: replace public-read policy to hide is_hidden from non-owners/non-admins
DROP POLICY IF EXISTS "Sermons viewable by everyone" ON public.sermons;
CREATE POLICY "Sermons viewable by everyone"
ON public.sermons FOR SELECT
TO public
USING (
  is_hidden = false
  OR (auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.channels c WHERE c.id = sermons.channel_id AND c.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ))
);

-- Channels: replace public-read policy to hide is_suspended from non-owners/non-admins
DROP POLICY IF EXISTS "Channels viewable by everyone" ON public.channels;
CREATE POLICY "Channels viewable by everyone"
ON public.channels FOR SELECT
TO public
USING (
  is_suspended = false
  OR (auth.uid() IS NOT NULL AND (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ))
);