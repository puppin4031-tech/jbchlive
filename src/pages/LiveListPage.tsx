import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import { Radio } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const LiveListPage = () => {
  const { data: liveChannels, isLoading } = useQuery({
    queryKey: ['live-channels-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*, sermons!inner(*)')
        .eq('is_live', true)
        .eq('is_approved', true)
        .eq('sermons.is_live', true);
      if (error) throw error;
      return data;
    },
  });

  const sermonCards: SermonCardData[] = (liveChannels || []).flatMap(ch =>
    (ch.sermons || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      preacher: s.preacher || '',
      category: s.category,
      thumbnailUrl: s.thumbnail_url || '/placeholder.svg',
      date: s.sermon_date,
      views: s.view_count,
      isLive: true,
      channelId: ch.id,
      channelName: ch.name,
      channelLogoUrl: ch.logo_url,
    }))
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 bg-live text-live-foreground text-sm font-bold px-3 py-1 rounded-md">
            <Radio className="w-4 h-4 animate-pulse" /> LIVE
          </span>
          <h1 className="font-semibold text-lg text-foreground">현재 라이브</h1>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2].map(i => <Skeleton key={i} className="aspect-video rounded-xl" />)}
          </div>
        ) : sermonCards.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">현재 라이브 중인 말씀이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sermonCards.map(s => <SermonCard key={s.id} sermon={s} />)}
          </div>
        )}
      </main>
    </div>
  );
};

export default LiveListPage;
