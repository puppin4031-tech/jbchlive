import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import ChannelCard from '@/components/ChannelCard';
import CategoryTabs from '@/components/CategoryTabs';

import { Radio, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { isPlayableLiveChannel } from '@/lib/livePlayback';
import defaultThumbnail from '@/assets/default-thumbnail.png';

const categories = ['전체', '주일말씀', '수요말씀', '특별집회'];

const Index = () => {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [liveAlert, setLiveAlert] = useState<{ id: string; name: string; logoUrl: string | null } | null>(null);
  const queryClient = useQueryClient();
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Realtime: listen for channels going live
  useEffect(() => {
    const channel = supabase
      .channel('home-live-alerts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channels',
          filter: 'is_approved=eq.true',
        },
        (payload) => {
          const newRow = (payload.new ?? {}) as any;
          const oldRow = (payload.old ?? {}) as any;
          // Always invalidate on any channel update — UI relies on fresh state
          queryClient.invalidateQueries({ queryKey: ['live-channels'] });
          queryClient.invalidateQueries({ queryKey: ['live-sermons-home'] });
          queryClient.invalidateQueries({ queryKey: ['all-approved-channels'] });
          // Show alert only on false/undefined → true transition
          if (newRow.is_live === true && oldRow.is_live !== true) {
            setLiveAlert({
              id: newRow.id,
              name: newRow.name,
              logoUrl: newRow.logo_url,
            });
            if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
            alertTimeoutRef.current = setTimeout(() => setLiveAlert(null), 10000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    };
  }, [queryClient]);

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
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
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
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
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

  // Fetch ALL approved channels for permanent live links strip
  const { data: allChannels } = useQuery({
    queryKey: ['all-approved-channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, logo_url, is_live')
        .eq('is_approved', true)
        .eq('is_suspended', false)
        .order('is_live', { ascending: false })
        .order('subscriber_count', { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const playableLiveChannels = (liveChannels || []).filter(isPlayableLiveChannel);

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

      {/* Live Alert Banner */}
      {liveAlert && (
        <div className="fixed top-16 md:top-14 left-0 right-0 z-50 animate-in slide-in-from-top duration-300">
          <Link
            to={`/live/${liveAlert.id}`}
            className="block"
            onClick={() => setLiveAlert(null)}
          >
            <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 shadow-lg">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive-foreground opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive-foreground"></span>
              </span>
              {liveAlert.logoUrl && (
                <img src={liveAlert.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              )}
              <span className="font-semibold text-sm md:text-base truncate">
                🔴 {liveAlert.name} 라이브가 시작되었습니다!
              </span>
              <span className="ml-auto text-xs opacity-80 shrink-0">시청하기 →</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive-foreground hover:bg-destructive-foreground/20"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLiveAlert(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </Link>
        </div>
      )}

      <main className="container px-4 py-4 max-w-5xl mx-auto space-y-6">
        {/* Permanent Church Live Links — always visible */}
        {allChannels && allChannels.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-xl md:text-base text-foreground">교회 라이브 링크</h2>
              <span className="text-xs text-muted-foreground ml-1">영구 링크 · 클릭하여 시청</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
              {allChannels.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/live/${ch.id}`}
                  className="shrink-0 w-32 md:w-36 snap-start rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
                    <img
                      src={ch.is_live ? (ch.logo_url || defaultThumbnail) : defaultThumbnail}
                      alt={ch.name}
                      className="w-full h-full object-cover"
                    />
                    {ch.is_live ? (
                      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-live text-live-foreground text-[10px] font-bold px-1 py-0.5 rounded">
                        <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                      </span>
                    ) : (
                      <span className="absolute top-1.5 left-1.5 bg-muted text-muted-foreground text-[10px] font-bold px-1 py-0.5 rounded border border-border">
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="font-semibold text-xs text-foreground truncate">{ch.name}</p>
                  </div>
                </Link>
              ))}
            </div>

          </section>
        )}

        {/* Live Channels Strip */}
        {playableLiveChannels.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center gap-1 bg-live text-live-foreground text-sm font-bold px-3 py-1 rounded-md">
                <Radio className="w-4 h-4 animate-pulse" /> 지금 라이브 중
              </span>
              <Link to="/live" className="ml-auto text-sm text-primary hover:underline">
                전체 보기 →
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
              {playableLiveChannels.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/live/${ch.id}`}
                  className="shrink-0 w-44 md:w-52 snap-start rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    {ch.logo_url ? (
                      <img src={ch.logo_url} alt={ch.name} className="w-16 h-16 rounded-full object-cover" />
                    ) : (
                      <Radio className="w-10 h-10 text-muted-foreground" />
                    )}
                    <span className="absolute top-2 left-2 flex items-center gap-1 bg-live text-live-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                    </span>
                  </div>
                  <div className="p-2">
                    <p className="font-semibold text-sm text-foreground truncate">{ch.name}</p>
                    <p className="text-xs text-muted-foreground">지금 시청하기 →</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Option A: 홈은 맛보기 — 라이브는 위 스트립에서만 노출, 메인 플레이어 없음 */}


        {/* Popular / Recent Sermons */}
        <section>
          <h2 className="font-semibold text-xl md:text-base mb-3 text-foreground">말씀 다시보기</h2>
          <CategoryTabs categories={categories} active={activeCategory} onSelect={setActiveCategory} />
          {vodsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-video rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
              {vodSermons?.map(s => <SermonCard key={s.id} sermon={mapSermon(s)} />)}
            </div>
          )}

          {vodSermons?.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-base md:text-sm">등록된 말씀이 없습니다.</p>
          )}
        </section>

        {/* Channels */}
        {channels && channels.length > 0 && (
          <section>
            <h2 className="font-semibold text-xl md:text-base mb-3 text-foreground">교회 채널</h2>
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
