import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  startChannel as apiStartChannel,
  stopChannel as apiStopChannel,
  getStatus as apiGetStatus,
} from '@/lib/liveStreamApi';
import { toFriendlyError, validateBeforeStart, type FriendlyError } from '@/lib/liveStreamErrors';
import { visibleGcpError } from '@/lib/gcpErrorFilter';
import { toast } from 'sonner';

export type BroadcastPhase =
  | 'no-channel'
  | 'pending-approval'
  | 'offline'
  | 'starting'
  | 'awaiting-input'
  | 'streaming'
  | 'stopping'
  | 'error';

const POLL_INTERVAL_MS = 5000;
/** Hard fail-safe: stop polling after 36 attempts (~3 minutes). */
const MAX_POLL_ATTEMPTS = 36;


export const useBroadcasterChannel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [gcpState, setGcpState] = useState<string>('');
  const [pollAttempts, setPollAttempts] = useState(0);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<FriendlyError | null>(null);

  const pollCountRef = useRef(0);
  const [pollExhausted, setPollExhausted] = useState(false);

  const { data: channel, refetch } = useQuery({
    queryKey: ['my-channel', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('owner_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const channelId = channel?.id;

  // Realtime subscription on own channel row
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel(`broadcaster-channel-${channelId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channels', filter: `id=eq.${channelId}` },
        () => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['channel-settings', channelId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, refetch, queryClient]);

  const effectiveGcpState = gcpState || channel?.gcp_channel_state || '';

  // Reset the polling budget whenever a new live attempt begins.
  useEffect(() => {
    if (!channel?.is_live) {
      pollCountRef.current = 0;
      setPollExhausted(false);
    }
  }, [channel?.is_live]);

  // Status polling: while live but state isn't STREAMING with stream_url, OR STARTING phase
  useEffect(() => {
    if (!channelId) return;
    const isLive = !!channel?.is_live;
    const needsPoll = isLive && !pollExhausted && (
      !channel?.stream_url ||
      effectiveGcpState === 'STARTING' ||
      effectiveGcpState === 'PENDING' ||
      effectiveGcpState === 'AWAITING_INPUT' ||
      effectiveGcpState === ''
    );
    if (!needsPoll) return;

    let cancelled = false;
    let id: number | undefined;
    const poll = async () => {
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        // Fail-safe: stop hitting the edge function after ~3 minutes.
        if (id) window.clearInterval(id);
        setPollExhausted(true);
        return;
      }
      pollCountRef.current += 1;
      try {
        const res = await apiGetStatus(channelId);
        if (cancelled) return;
        setGcpState(res.streamingState || 'UNKNOWN');
        setPollAttempts(pollCountRef.current);
        setLastPolledAt(new Date());
        if (res.streamUrl && !channel?.stream_url) {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['live-channels'] });
          queryClient.invalidateQueries({ queryKey: ['live-channels-list'] });
          queryClient.invalidateQueries({ queryKey: ['all-approved-channels'] });
        }
      } catch (e) {
        console.error('broadcaster polling error', e);
        // Immediate exit on failure — never loop against a failing backend.
        if (id) window.clearInterval(id);
        setPollExhausted(true);
      }
    };
    poll();
    id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
    };
  }, [channelId, channel?.is_live, channel?.stream_url, effectiveGcpState, pollExhausted, refetch, queryClient]);



  const phase: BroadcastPhase = useMemo(() => {
    if (!channel) return 'no-channel';
    if (!channel.is_approved) return 'pending-approval';
    if (visibleGcpError(channel.gcp_last_error) && !channel.is_live) return 'error';
    if (!channel.is_live) return 'offline';
    if (effectiveGcpState === 'STREAMING' || channel.stream_url) return 'streaming';
    if (effectiveGcpState === 'AWAITING_INPUT') return 'awaiting-input';
    return 'starting';
  }, [channel, effectiveGcpState]);

  const startLive = useMutation({
    mutationFn: async () => {
      if (!channelId) throw new Error('채널이 없습니다');
      // Pre-flight validation
      const preErr = validateBeforeStart(channel || {});
      if (preErr) {
        setLastError(preErr);
        throw new Error(preErr.title);
      }
      setLastError(null);
      await apiStartChannel(channelId);
    },
    onSuccess: () => {
      setGcpState('STARTING');
      setPollAttempts(0);
      pollCountRef.current = 0;
      setPollExhausted(false);
      setLastError(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
      queryClient.invalidateQueries({ queryKey: ['live-channels-list'] });
    },
    onError: (e: unknown) => {
      const fe = lastError ?? toFriendlyError(e);
      setLastError(fe);
      toast.error(fe.title, { description: fe.message });
    },
  });

  const stopLive = useMutation({
    mutationFn: async (_?: unknown) => {
      if (!channelId) throw new Error('채널이 없습니다');
      await apiStopChannel(channelId);
    },
    onSuccess: () => {
      toast.success('라이브가 종료되었습니다');
      setGcpState('');
      pollCountRef.current = 0;
      setPollExhausted(false);
      setLastError(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
      queryClient.invalidateQueries({ queryKey: ['live-channels-list'] });
      queryClient.invalidateQueries({ queryKey: ['live-sermons-home'] });
    },
    onError: (e: unknown) => {
      const fe = toFriendlyError(e);
      setLastError(fe);
      toast.error(fe.title, { description: fe.message });
    },
  });

  return {
    channel,
    phase,
    gcpState,
    pollAttempts,
    lastPolledAt,
    lastError,
    dismissError: () => setLastError(null),
    startLive,
    stopLive,
    refresh: refetch,
  };
};

export const formatElapsed = (startedAt: string | null | undefined, now: number): string => {
  if (!startedAt) return '00:00';
  const diff = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
