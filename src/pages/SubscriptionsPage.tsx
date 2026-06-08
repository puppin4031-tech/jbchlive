import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { Skeleton } from '@/components/ui/skeleton';

const SubscriptionsPage = () => {
  const { user, loading } = useAuth();
  const { subscriptions } = useSubscriptions();
  const channelIds = subscriptions.map((s) => s.channel_id);

  const { data: sermons, isLoading } = useQuery({
    queryKey: ['subscribed-sermons', channelIds],
    queryFn: async () => {
      if (channelIds.length === 0) return [];
      const { data, error } = await supabase
        .from('sermons')
        .select('*, channels!inner(name, logo_url)')
        .in('channel_id', channelIds)
        .eq('is_live', false)
        .order('sermon_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
    enabled: channelIds.length > 0,
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
    channelName: s.channels?.name,
    channelLogoUrl: s.channels?.logo_url,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-5">
        <h1 className="text-xl font-bold text-foreground">구독한 채널의 새 영상</h1>

        {channelIds.length === 0 ? (
          <p className="text-muted-foreground text-base py-12 text-center">
            아직 구독한 채널이 없습니다.{' '}
            <Link to="/" className="text-primary underline">홈에서 채널을 둘러보세요</Link>.
          </p>
        ) : isLoading ? (
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
      </main>
    </div>
  );
};

export default SubscriptionsPage;
