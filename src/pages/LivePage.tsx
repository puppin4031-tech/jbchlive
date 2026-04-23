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
  const viewerCount = useViewerCount(channelId, isLive);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
        {/* Live or Offline Player Area */}
        {isLive && streamUrl ? (
          <VideoPlayer src={streamUrl} autoPlay />
        ) : (
          <div className="relative w-full aspect-video bg-muted rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
            <VideoOff className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm text-center px-4">
              현재 라이브가 아닙니다.<br />
              라이브가 시작되면 여기서 자동으로 시청할 수 있습니다.
            </p>
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
