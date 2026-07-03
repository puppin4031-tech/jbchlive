
-- Live viewer stats on channels (during live) + broadcaster presence + low-viewer tracking
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS current_viewers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_viewers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_watch_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_viewer_since timestamptz NULL,
  ADD COLUMN IF NOT EXISTS broadcaster_last_seen_at timestamptz NULL;
