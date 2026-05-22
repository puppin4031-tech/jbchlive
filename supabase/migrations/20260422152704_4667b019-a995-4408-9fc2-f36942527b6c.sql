ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS gcp_input_uri text,
  ADD COLUMN IF NOT EXISTS gcp_channel_state text,
  ADD COLUMN IF NOT EXISTS gcp_provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS gcp_last_error text,
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz;