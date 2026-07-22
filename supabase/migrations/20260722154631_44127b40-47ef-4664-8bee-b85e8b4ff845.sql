
-- Enum for broadcast type
DO $$ BEGIN
  CREATE TYPE public.broadcast_type AS ENUM ('sunday_sermon', 'gathering');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add columns to channels
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS youtube_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS youtube_channel_id text,
  ADD COLUMN IF NOT EXISTS youtube_channel_title text,
  ADD COLUMN IF NOT EXISTS youtube_last_broadcast_id text,
  ADD COLUMN IF NOT EXISTS youtube_last_video_id text,
  ADD COLUMN IF NOT EXISTS youtube_last_watch_url text;

-- Sensitive refresh token stored separately, server-only
CREATE TABLE IF NOT EXISTS public.channel_youtube_tokens (
  channel_id uuid PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.channel_youtube_tokens TO service_role;
-- No grants to anon/authenticated: server-only

ALTER TABLE public.channel_youtube_tokens ENABLE ROW LEVEL SECURITY;
-- No policies = no client access. Only service_role bypasses RLS.

CREATE TRIGGER update_channel_youtube_tokens_updated_at
BEFORE UPDATE ON public.channel_youtube_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- live_sessions extensions
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS broadcast_type public.broadcast_type NOT NULL DEFAULT 'gathering',
  ADD COLUMN IF NOT EXISTS youtube_broadcast_id text,
  ADD COLUMN IF NOT EXISTS youtube_video_id text,
  ADD COLUMN IF NOT EXISTS youtube_watch_url text;

-- channels: track current session's broadcast type so viewers know how to render
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS current_broadcast_type public.broadcast_type,
  ADD COLUMN IF NOT EXISTS current_youtube_video_id text,
  ADD COLUMN IF NOT EXISTS current_youtube_watch_url text;
