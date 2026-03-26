import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import ChannelCard from '@/components/ChannelCard';
import CategoryTabs from '@/components/CategoryTabs';
import VideoPlayer from '@/components/VideoPlayer';
import { Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const categories = ['전체', '주일말씀', '수요말씀', '특별집회'];

const Index = () => {
  const [activeCategory, setActiveCategory] = useState('전체');

  // Fetch live channels
  const { data: liveChannels } = useQuery({
    queryKey: ['live-channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_live', true)
        .eq('is_approved', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch live sermons (for metadata)
  const { data: liveSermons } = useQuery({
    queryKey: ['live-sermons-home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*, channels!inner(name, logo_url)')
        .eq('is_live', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch VOD sermons with channel info
  const { data: vodSermons, isLoading: vodsLoading } = useQuery({
    queryKey: ['vod-sermons-home', activeCategory],
    queryFn: async () => {
      let query = supabase
        .from('sermons')
        .select('*, channels!inner(name, logo_url)')
        .eq('is_live', false)
        .order('sermon_date', { ascending: false })
        .limit(12);
      if (activeCategory !== '전체') {
        query = query.eq('category', activeCategory);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch approved channels
  const { data: channels } = useQuery({
    queryKey: ['channels-home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_approved', true)
        .order('subscriber_count', { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const currentLiveChannel = liveChannels?.[0];
  const currentLiveSermon = liveSermons?.find(s => s.channel_id === currentLiveChannel?.id);

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

      <main className="container px-4 py-4 max-w-5xl mx-auto space-y-6">
        {/* Live Now Section */}
        {currentLiveChannel && currentLiveChannel.stream_url && (
          <section>
            <Link to={`/live/${currentLiveChannel.id}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center gap-1 bg-live text-live-foreground text-base md:text-xs font-bold px-3 py-1.5 md:px-2.5 md:py-1 rounded-md">
                  <Radio className="w-5 h-5 md:w-3.5 md:h-3.5 animate-pulse" /> LIVE NOW
                </span>
              </div>
              <VideoPlayer src={currentLiveChannel.stream_url || ''} />
              <div className="mt-3 flex items-start gap-3">
                <img src={currentLiveChannel.logo_url || '/placeholder.svg'} alt={currentLiveChannel.name} className="w-12 h-12 md:w-10 md:h-10 rounded-full object-cover" />
                <div>
                  <h2 className="font-semibold text-lg md:text-base text-foreground">{currentLiveSermon?.title || currentLiveChannel.name}</h2>
                  <p className="text-base md:text-sm text-muted-foreground">{currentLiveChannel.name}{currentLiveSermon?.preacher && ` · ${currentLiveSermon.preacher}`}</p>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Other Live */}
        {liveChannels && liveChannels.length > 1 && (
          <section>
            <h2 className="font-semibold text-xl md:text-base mb-3 text-foreground">다른 라이브</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {liveChannels.slice(1).map(ch => {
                const sermon = liveSermons?.find(s => s.channel_id === ch.id);
                return sermon ? <SermonCard key={ch.id} sermon={mapSermon(sermon)} /> : null;
              })}
            </div>
          </section>
        )}

        {/* Popular / Recent Sermons */}
        <section>
          <h2 className="font-semibold text-lg md:text-base mb-3 text-foreground">말씀 다시보기</h2>
          <CategoryTabs categories={categories} active={activeCategory} onSelect={setActiveCategory} />
          {vodsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-video rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {vodSermons?.map(s => <SermonCard key={s.id} sermon={mapSermon(s)} />)}
            </div>
          )}
          {vodSermons?.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">등록된 말씀이 없습니다.</p>
          )}
        </section>

        {/* Channels */}
        {channels && channels.length > 0 && (
          <section>
            <h2 className="font-semibold text-lg md:text-base mb-3 text-foreground">교회 채널</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {channels.map(ch => <ChannelCard key={ch.id} channel={ch} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Index;
