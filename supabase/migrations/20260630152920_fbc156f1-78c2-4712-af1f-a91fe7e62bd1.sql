ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS rtmp_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_stop_disconnect_minutes integer NOT NULL DEFAULT 1;