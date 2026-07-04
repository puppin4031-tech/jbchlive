ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS gcp_input_id text,
  ADD COLUMN IF NOT EXISTS gcp_channel_id text,
  ADD COLUMN IF NOT EXISTS gcp_output_uri text;