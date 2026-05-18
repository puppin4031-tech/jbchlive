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
 * Sends a viewer heartbeat to the live-stream edge function every 30s while
 * a live stream is active. Used by the server to sample concurrent viewer
 * counts for channel history (live_sessions).
 */
export const useViewerHeartbeat = (channelId: string | undefined, isLive: boolean) => {
  useEffect(() => {
    if (!channelId || !isLive) return;
    const viewerKey = getOrCreateViewerKey();

    const beat = () => {
      supabase.functions
        .invoke('live-stream', {
          body: { action: 'viewerHeartbeat', channelId, viewerKey },
        })
        .catch(() => {
          // Silent: heartbeat failures must never disrupt viewing
        });
    };

    beat();
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, [channelId, isLive]);
};
