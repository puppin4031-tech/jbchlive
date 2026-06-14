
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS auto_stop_max_minutes integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS low_viewer_threshold integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS keepalive_grace_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS keepalive_prompt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS keepalive_confirmed_at timestamptz;
