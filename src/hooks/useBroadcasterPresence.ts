import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { heartbeatBroadcaster } from "@/lib/liveStreamApi";

/**
 * Broadcaster presence heartbeat — Layer 1 zombie-stream defense.
 *
 * While the broadcaster control panel is mounted AND the channel is live,
 * ping the backend every 60s to update `channels.broadcaster_last_seen_at`.
 * Also fires on tab hide / page unload via `sendBeacon`.
 *
 * The backend watchdog only auto-stops when heartbeat is stale AND there
 * is no active RTMP input, so an accidental tab close never kills an
 * actively streaming OBS session.
 */
export function useBroadcasterPresence(channelId: string | undefined, isLive: boolean) {
  useEffect(() => {
    if (!channelId || !isLive) return;

    let cancelled = false;

    const ping = () => {
      heartbeatBroadcaster(channelId).catch(() => {
        // Silent — this is a best-effort signal.
      });
    };

    // Immediate + interval
    ping();
    const interval = window.setInterval(() => {
      if (!cancelled) ping();
    }, 60_000);

    // Best-effort beacon on unload / hide (does NOT stop the channel).
    const beacon = () => {
      try {
        const url = `${(supabase as unknown as { supabaseUrl: string }).supabaseUrl}/functions/v1/live-stream`;
        const token = (supabase.auth as unknown as { currentSession?: { access_token?: string } })
          .currentSession?.access_token;
        const payload = JSON.stringify({ action: "heartbeatBroadcaster", channelId });
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon && token) {
          navigator.sendBeacon(url, blob);
        }
      } catch {
        // ignore
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") beacon();
    };
    window.addEventListener("pagehide", beacon);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", beacon);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [channelId, isLive]);
}
