UPDATE public.channels
SET gcp_input_id = NULL,
    gcp_channel_id = NULL,
    gcp_input_uri = NULL,
    gcp_channel_state = NULL,
    gcp_last_error = NULL,
    stream_url = NULL,
    is_live = false,
    updated_at = now()
WHERE gcp_input_id IS NOT NULL OR gcp_channel_id IS NOT NULL;