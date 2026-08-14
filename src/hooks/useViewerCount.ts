import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Realtime presence viewer count.
 *
 * Credit-saving rule: the websocket is opened ONLY while `isLive === true`.
 * As soon as the channel goes offline (or the component unmounts) the
 * presence is untracked and the channel is removed, so no Realtime
 * resources are consumed while a stream is offline.
 */
export const useViewerCount = (channelId: string | undefined, isLive: boolean) => {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (!channelId || !isLive) {
      setViewerCount(0);
      return;
    }

    let disposed = false;
    const channel = supabase.channel(`viewers-${channelId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        if (disposed) return;
        const state = channel.presenceState();
        const count = Object.values(state).reduce((sum, arr) => sum + arr.length, 0);
        setViewerCount(count);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !disposed) {
          await channel.track({ joined_at: new Date().toISOString() });
        }
      });

    return () => {
      disposed = true;
      setViewerCount(0);
      channel.untrack().catch(() => undefined);
      supabase.removeChannel(channel);
    };
  }, [channelId, isLive]);

  return viewerCount;
};
