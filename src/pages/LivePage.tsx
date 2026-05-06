import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import Header from '@/components/Header';
import VideoPlayer from '@/components/VideoPlayer';
import SermonCard from '@/components/SermonCard';
import { supabase } from '@/integrations/supabase/client';
import { useViewerCount } from '@/hooks/useViewerCount';
import { Share2, Users, Radio, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { isPlayableLiveChannel, isPreparingLiveChannel } from '@/lib/livePlayback';

const LivePage = () => {
  const { channelId } = useParams();
  const queryClient = useQueryClient();

  // Fetch channel data
  const { data: channel, isLoading: channelLoading } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Fetch current live sermon for this channel
  const { data: liveSermon } = useQuery({
    queryKey: ['live-sermon', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('channel_id', channelId!)
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!channelId && !!channel?.is_live,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Fetch recent VODs
  const { data: recentVods } = useQuery({
    queryKey: ['recent-vods', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('channel_id', channelId!)
        .eq('is_live', false)
        .order('sermon_date', { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
  });

  // Viewer count (must be called unconditionally before any early return)
  const viewerCount = useViewerCount(channelId, !!channel?.is_live);

  // Update document title for sharing
  useEffect(() => {
    if (channel?.name) {
      document.title = `${channel.name} 라이브 - Live Word Mission`;
    }
    return () => {
      document.title = 'Live Word Mission';
    };
  }, [channel?.name]);

  // Realtime subscription for live status changes
  useEffect(() => {
    if (!channelId) return;

    const subscription = supabase
      .channel(`live-status-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channels',
          filter: `id=eq.${channelId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
          queryClient.invalidateQueries({ queryKey: ['live-sermon', channelId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channelId, queryClient]);

  const handleShare = () => {
    const url = `${window.location.origin}/live/${channelId}`;
    navigator.clipboard.writeText(url);
    toast.success('링크가 복사되었습니다!');
  };

  if (channelLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
          <Skeleton className="w-full aspect-video rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          채널을 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const isLive = channel.is_live;
  const streamUrl = channel.stream_url;
  const canPlayLive = isPlayableLiveChannel(channel);
  const isWaitingForBroadcaster = isPreparingLiveChannel(channel);
  const permanentUrl = `${window.location.origin}/live/${channelId}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
        {/* Live or Offline Player Area */}
        {canPlayLive && streamUrl ? (
          <VideoPlayer src={streamUrl} autoPlay />
        ) : isWaitingForBroadcaster ? (
          <div className="relative w-full aspect-video bg-card border border-border rounded-xl overflow-hidden flex flex-col items-center justify-center gap-4 p-6">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive"></span>
            </span>
            <div className="text-center space-y-2">
              <h2 className="font-semibold text-lg text-foreground">방송 준비 중입니다</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                방송자가 송출을 시작하는 즉시 자동으로 재생됩니다.<br />
                잠시만 기다려주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative w-full aspect-video bg-card border border-border rounded-xl overflow-hidden flex flex-col items-center justify-center gap-4 p-6">
            <img
              src={channel.logo_url || '/placeholder.svg'}
              alt={channel.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-border"
            />
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded">
                <VideoOff className="w-3 h-3" /> 현재 오프라인
              </span>
              <h2 className="font-semibold text-lg text-foreground">{channel.name}</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                라이브가 시작되면 이 페이지에서 자동으로 재생됩니다.<br />
                아래 링크를 공유하여 시청자를 초대하세요.
              </p>
            </div>
            <div className="w-full max-w-md flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
              <code className="flex-1 text-xs text-foreground truncate">{permanentUrl}</code>
              <Button size="sm" variant="outline" onClick={handleShare}>
                <Share2 className="w-3 h-3 mr-1" /> 복사
              </Button>
            </div>
          </div>
        )}

        {/* Channel Info */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <img
              src={channel.logo_url || '/placeholder.svg'}
              alt={channel.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <h1 className="font-semibold text-lg text-foreground flex items-center gap-2">
                {liveSermon?.title || channel.name}
                {isLive && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                    <Radio className="w-3 h-3 animate-pulse" /> LIVE
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                {channel.name}
                {liveSermon?.preacher && ` · ${liveSermon.preacher}`}
              </p>
              {isLive && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Users className="w-3 h-3" /> {viewerCount.toLocaleString()}명 시청 중
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleShare} className="shrink-0">
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>

        {/* Recent VODs */}
        {recentVods && recentVods.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">
              {isLive ? '최근 설교' : '최근 설교 다시보기'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {recentVods.map(s => (
                <SermonCard key={s.id} sermon={{
                  id: s.id,
                  title: s.title,
                  preacher: s.preacher || '',
                  category: s.category,
                  thumbnailUrl: s.thumbnail_url || undefined,
                  videoUrl: s.video_url || undefined,
                  date: s.sermon_date,
                  views: s.view_count,
                  isLive: s.is_live,
                  duration: s.duration || undefined,
                  channelId: s.channel_id,
                  channelName: channel.name,
                  channelLogoUrl: channel.logo_url,
                }} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default LivePage;
