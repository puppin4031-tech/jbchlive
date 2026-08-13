import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the channel's RTMP ingest URI.
 *
 * The URI is a credential and is NOT stored on the publicly readable `channels`
 * row anymore. It lives in the owner-only `channel_stream_keys` table and is
 * only returned by the `get_channel_rtmp` function to the channel owner or an
 * admin. Everyone else gets null.
 */
export function useChannelRtmp(channelId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['channel-rtmp', channelId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_channel_rtmp', {
        _channel_id: channelId!,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: !!channelId && enabled,
    staleTime: 60_000,
  });
}
