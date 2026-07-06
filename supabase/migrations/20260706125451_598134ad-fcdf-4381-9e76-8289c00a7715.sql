UPDATE public.channels
SET is_live = false,
    gcp_channel_state = 'STOPPED',
    stream_url = NULL,
    current_viewers = 0,
    low_viewer_since = NULL,
    broadcaster_last_seen_at = NULL,
    gcp_last_error = NULL,
    live_started_at = NULL,
    updated_at = now()
WHERE id = 'c59ff38e-01a9-444e-a31d-c9d2e408ea9f';
UPDATE public.live_sessions
SET ended_at = now(), end_reason = 'auto_reset'
WHERE channel_id = 'c59ff38e-01a9-444e-a31d-c9d2e408ea9f' AND ended_at IS NULL;
