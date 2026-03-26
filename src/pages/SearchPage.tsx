import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import SermonCard, { type SermonCardData } from '@/components/SermonCard';
import ChannelCard from '@/components/ChannelCard';
import { Search } from 'lucide-react';

const sanitizeSearchQuery = (q: string): string => {
  // Remove special SQL/regex characters to prevent injection
  return q.replace(/[%_\\'";\(\)]/g, '').trim().slice(0, 100);
};

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const rawQuery = searchParams.get('q') || '';
  const query = sanitizeSearchQuery(rawQuery);

  const { data: matchedSermons } = useQuery({
    queryKey: ['search-sermons', query],
    queryFn: async () => {
      if (!query) return [];
      const { data, error } = await supabase
        .from('sermons')
        .select('*, channels!inner(name, logo_url)')
        .or(`title.ilike.%${query}%,preacher.ilike.%${query}%,category.ilike.%${query}%`)
        .order('sermon_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: query.length > 0,
  });

  const { data: matchedChannels } = useQuery({
    queryKey: ['search-channels', query],
    queryFn: async () => {
      if (!query) return [];
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_approved', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: query.length > 0,
  });

  const sermonCards: SermonCardData[] = (matchedSermons || []).map((s: any) => ({
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
  }));

  const noResults = sermonCards.length === 0 && (!matchedChannels || matchedChannels.length === 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Search className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-semibold text-lg">"{rawQuery}" 검색 결과</h1>
        </div>

        {noResults && query && (
          <p className="text-center text-muted-foreground py-12 text-sm">검색 결과가 없습니다.</p>
        )}

        {matchedChannels && matchedChannels.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">채널</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {matchedChannels.map(ch => <ChannelCard key={ch.id} channel={ch} />)}
            </div>
          </section>
        )}

        {sermonCards.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">말씀</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {sermonCards.map(s => <SermonCard key={s.id} sermon={s} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
