import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Radio } from 'lucide-react';

interface SubscribedChannel {
  id: string;
  name: string;
  logo_url: string | null;
  is_live: boolean;
  subscriber_count: number;
}

const SubscriptionsPage = () => {
  const { user, loading } = useAuth();
  const { subscriptions } = useSubscriptions();
  const channelIds = subscriptions.map((s) => s.channel_id);

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['subscribed-channels', channelIds],
    queryFn: async (): Promise<SubscribedChannel[]> => {
      if (channelIds.length === 0) return [];
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, logo_url, is_live, subscriber_count')
        .in('id', channelIds)
        .order('is_live', { ascending: false })
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: channelIds.length > 0,
    staleTime: 60_000,
  });

  const { data: sermons, isLoading } = useQuery({
    queryKey: ['subscribed-sermons', channelIds],
    queryFn: async () => {
      if (channelIds.length === 0) return [];
      const { data, error } = await supabase
        .from('sermons')
        .select('*, channels!inner(name, logo_url)')
        .in('channel_id', channelIds)
        .eq('is_live', false)
        .order('sermon_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
    enabled: channelIds.length > 0,
    staleTime: 60_000,
  });

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const mapSermon = (s: any): SermonCardData => ({
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
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">구독</h1>

        {channelIds.length === 0 ? (
          <p className="text-muted-foreground text-base py-12 text-center">
            아직 구독한 채널이 없습니다.{' '}
            <Link to="/" className="text-primary underline">홈에서 채널을 둘러보세요</Link>.
          </p>
        ) : (
          <>
            {/* 구독한 채널 가로 스크롤 */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                구독한 채널 {channels.length > 0 && <span className="text-muted-foreground font-normal">({channels.length})</span>}
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {channelsLoading
                  ? [1, 2, 3, 4].map((i) => (
                      <div key={i} className="shrink-0 w-[76px] space-y-2">
                        <Skeleton className="w-[68px] h-[68px] rounded-full mx-auto" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))
                  : channels.map((ch) => (
                      <Link
                        key={ch.id}
                        to={ch.is_live ? `/live/${ch.id}` : `/channel/${ch.id}`}
                        className="shrink-0 w-[76px] text-center group"
                      >
                        <div className="relative mx-auto w-[68px] h-[68px]">
                          <Avatar className={`w-[68px] h-[68px] border-2 transition-colors ${ch.is_live ? 'border-destructive' : 'border-border group-hover:border-primary'}`}>
                            <AvatarImage src={ch.logo_url ?? undefined} alt={`${ch.name} 채널 로고`} />
                            <AvatarFallback className="text-base font-semibold">
                              {ch.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          {ch.is_live && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                              <Radio className="w-2.5 h-2.5" />LIVE
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-tight text-foreground line-clamp-2 break-keep">
                          {ch.name}
                        </p>
                      </Link>
                    ))}
              </div>
            </section>

            {/* 구독 채널 영상 */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">구독한 채널의 영상</h2>
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-video rounded-xl" />)}
                </div>
              ) : sermons && sermons.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {sermons.map((s) => <SermonCard key={s.id} sermon={mapSermon(s)} compact />)}
                </div>
              ) : (
                <p className="text-muted-foreground text-base py-12 text-center">
                  구독한 채널에 업로드된 영상이 없습니다.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default SubscriptionsPage;
