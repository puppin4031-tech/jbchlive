import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VIEWER_KEY_STORAGE = 'lwm_viewer_key';

function getOrCreateViewerKey(): string {
  try {
    let key = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(VIEWER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    // localStorage unavailable (private mode etc.)
    return crypto.randomUUID();
  }
}

/**
 * Sends a viewer heartbeat to the live-stream edge function every 60 seconds
 * while a live stream is active. The backend uses these beats to compute
 * current viewers, peak viewers and average watch time.
 *
 * Only runs while `isLive === true` — no traffic when the stream is offline.
 */
export const useViewerHeartbeat = (channelId: string | undefined, isLive: boolean) => {
  useEffect(() => {
    if (!channelId || !isLive) return;
    const viewerKey = getOrCreateViewerKey();
    let stopped = false;

    const beat = () => {
      if (stopped) return;
      supabase.functions
        .invoke('live-stream', {
          body: { action: 'viewerHeartbeat', channelId, viewerKey },
        })
        .catch(() => {
          // Silent: heartbeat failures must never disrupt viewing
        });
    };

    beat();
    const id = setInterval(beat, 60_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [channelId, isLive]);
};

