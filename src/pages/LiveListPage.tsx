import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import { Radio } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const LiveListPage = () => {
  const queryClient = useQueryClient();

  const { data: liveChannels, isLoading } = useQuery({
    queryKey: ['live-channels-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*, sermons(id, title, preacher, category, thumbnail_url, video_url, sermon_date, view_count, is_live, duration)')
        .eq('is_live', true)
        .eq('is_approved', true)
        .eq('is_suspended', false);
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Realtime: refresh when any channel goes live/offline
  useEffect(() => {
    const ch = supabase
      .channel('live-list-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channels' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['live-channels-list'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

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
            {[1, 2].map((i) => (
              <Skeleton key={i} className="aspect-video rounded-xl" />
            ))}
          </div>
        ) : !liveChannels || liveChannels.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">현재 라이브 중인 채널이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveChannels.map((ch: any) => {
              const liveSermon = (ch.sermons || []).find((s: any) => s.is_live);
              if (liveSermon) {
                const sermon: SermonCardData = {
                  id: liveSermon.id,
                  title: liveSermon.title,
                  preacher: liveSermon.preacher || '',
                  category: liveSermon.category,
                  thumbnailUrl: liveSermon.thumbnail_url || undefined,
                  videoUrl: liveSermon.video_url || undefined,
                  date: liveSermon.sermon_date,
                  views: liveSermon.view_count,
                  isLive: true,
                  channelId: ch.id,
                  channelName: ch.name,
                  channelLogoUrl: ch.logo_url,
                };
                return <SermonCard key={ch.id} sermon={sermon} />;
              }
              // Channel-only card (no sermon record)
              return (
                <Link
                  key={ch.id}
                  to={`/live/${ch.id}`}
                  className="group rounded-xl overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
                >
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    {ch.logo_url ? (
                      <img src={ch.logo_url} alt={ch.name} className="w-24 h-24 rounded-full object-cover" />
                    ) : (
                      <Radio className="w-12 h-12 text-muted-foreground" />
                    )}
                    <span className="absolute top-2 left-2 flex items-center gap-1 bg-live text-live-foreground text-xs font-bold px-2 py-1 rounded">
                      <Radio className="w-3 h-3 animate-pulse" /> LIVE
                    </span>
                  </div>
                  <div className="p-3 flex items-center gap-2">
                    <img
                      src={ch.logo_url || '/placeholder.svg'}
                      alt={ch.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">지금 방송 중</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default LiveListPage;
