
-- 1. live_sessions: one row per broadcast
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  title text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  peak_viewers integer NOT NULL DEFAULT 0,
  avg_viewers numeric(6,2) NOT NULL DEFAULT 0,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_sessions_channel_started ON public.live_sessions(channel_id, started_at DESC);
CREATE INDEX idx_live_sessions_active ON public.live_sessions(channel_id) WHERE ended_at IS NULL;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live sessions viewable by everyone"
  ON public.live_sessions FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: service role only (no policy = denied for normal users)

-- 2. live_viewer_samples: per-minute viewer count snapshots
CREATE TABLE public.live_viewer_samples (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  viewer_count integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_viewer_samples_session ON public.live_viewer_samples(session_id, sampled_at);

ALTER TABLE public.live_viewer_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view samples"
  ON public.live_viewer_samples FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.live_sessions s
      JOIN public.channels c ON c.id = s.channel_id
      WHERE s.id = live_viewer_samples.session_id
        AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- 3. viewer_presence: ephemeral heartbeat table
CREATE TABLE public.viewer_presence (
  channel_id uuid NOT NULL,
  viewer_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, viewer_key)
);
CREATE INDEX idx_viewer_presence_seen ON public.viewer_presence(last_seen_at);

ALTER TABLE public.viewer_presence ENABLE ROW LEVEL SECURITY;
-- service-role only (no public policies)

-- 4. Schedule sampleLiveViewers cron (every 1 minute)
SELECT cron.schedule(
  'sample-live-viewers',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nhdopijdmrowknwqouxw.supabase.co/functions/v1/live-stream',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := jsonb_build_object('action', 'sampleLiveViewers')
  );
  $$
);
