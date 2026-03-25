import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useViewerCount = (channelId: string | undefined, isLive: boolean) => {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (!channelId || !isLive) {
      setViewerCount(0);
      return;
    }

    const channel = supabase.channel(`viewers-${channelId}`, {
      config: { presence: { key: channelId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.values(state).reduce((sum, arr) => sum + arr.length, 0);
        setViewerCount(count);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ joined_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, isLive]);

  return viewerCount;
};
