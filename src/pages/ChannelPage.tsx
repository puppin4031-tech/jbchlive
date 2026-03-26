import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import CategoryTabs from '@/components/CategoryTabs';
import { Users, Heart, Radio, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const categories = ['전체', '주일말씀', '수요말씀', '특별집회'];

const ChannelPage = () => {
  const { channelId } = useParams();
  const { user, isAdmin } = useAuth();
  const [activeCategory, setActiveCategory] = useState('전체');
  const [subscribed, setSubscribed] = useState(false);

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

  const { data: sermons, isLoading: sermonsLoading } = useQuery({
    queryKey: ['channel-sermons', channelId, activeCategory],
    queryFn: async () => {
      let query = supabase
        .from('sermons')
        .select('*')
        .eq('channel_id', channelId!)
        .order('sermon_date', { ascending: false });
      if (activeCategory !== '전체') {
        query = query.eq('category', activeCategory);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
  });

  const canEdit = channel && user && (channel.owner_id === user.id || isAdmin);

  if (channelLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
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
    channelName: channel.name,
    channelLogoUrl: channel.logo_url,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-5">
        {/* Channel Header */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-card">
          <img src={channel.logo_url || '/placeholder.svg'} alt={channel.name} className="w-16 h-16 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xl text-foreground">{channel.name}</h1>
              {channel.is_live && (
                <span className="flex items-center gap-1 bg-live text-live-foreground text-xs font-bold px-2 py-0.5 rounded-md">
                  <Radio className="w-3 h-3" /> LIVE
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Users className="w-3 h-3" /> 구독자 {channel.subscriber_count.toLocaleString()}명
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className={subscribed ? 'bg-muted text-muted-foreground hover:bg-muted/80' : ''}
            onClick={() => { setSubscribed(!subscribed); toast.success(subscribed ? '구독이 취소되었습니다.' : '구독되었습니다!'); }}
          >
            {subscribed ? '구독중' : '구독'}
          </Button>
          <Button variant="outline" onClick={() => { toast.info('즐겨찾기는 로그인 후 사용 가능합니다.'); }}>
            <Heart className="w-4 h-4 mr-1" /> 즐겨찾기
          </Button>
          {canEdit && (
            <Link to={`/channel/${channelId}/settings`}>
              <Button variant="outline" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>

        {/* Sermons */}
        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">말씀 목록</h2>
          <CategoryTabs categories={categories} active={activeCategory} onSelect={setActiveCategory} />
          {sermonsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {[1,2,3].map(i => <Skeleton key={i} className="aspect-video rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {sermons?.map(s => <SermonCard key={s.id} sermon={mapSermon(s)} />)}
            </div>
          )}
          {!sermonsLoading && sermons?.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">해당 카테고리의 말씀이 없습니다.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default ChannelPage;
