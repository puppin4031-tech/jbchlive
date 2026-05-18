
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_stop_idle_minutes INTEGER NOT NULL DEFAULT 15;

CREATE INDEX IF NOT EXISTS idx_channels_scheduled_start
  ON public.channels(scheduled_start_at) WHERE scheduled_start_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_scheduled_end
  ON public.channels(scheduled_end_at) WHERE scheduled_end_at IS NOT NULL;
