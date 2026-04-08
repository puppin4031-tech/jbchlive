import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import VideoPlayer from '@/components/VideoPlayer';
import SermonCard from '@/components/SermonCard';
import { Eye, Calendar, Share2 } from 'lucide-react';
import SermonChat from '@/components/SermonChat';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const VodPage = () => {
  const { sermonId } = useParams();

  const { data: sermon, isLoading: sermonLoading } = useQuery({
    queryKey: ['sermon', sermonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('id', sermonId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!sermonId,
  });

  const { data: channel } = useQuery({
    queryKey: ['channel', sermon?.channel_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('id', sermon!.channel_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!sermon?.channel_id,
  });

  const { data: related } = useQuery({
    queryKey: ['related-sermons', sermonId, sermon?.channel_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('is_live', false)
        .neq('id', sermonId!)
        .order('sermon_date', { ascending: false })
        .limit(4);
      if (error) throw error;
      return data;
    },
    enabled: !!sermonId,
  });

  if (sermonLoading) {
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

  if (!sermon) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          영상을 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
        <VideoPlayer src={sermon.video_url || ''} poster={sermon.thumbnail_url || undefined} />

        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <Link to={channel ? `/channel/${channel.id}` : '#'}>
              <img
                src={channel?.logo_url || '/placeholder.svg'}
                alt={channel?.name || ''}
                className="w-10 h-10 rounded-full object-cover"
              />
            </Link>
            <div>
              <h1 className="font-semibold text-lg text-foreground">{sermon.title}</h1>
              <p className="text-sm text-muted-foreground">
                {channel?.name || ''}
                {sermon.preacher && ` · ${sermon.preacher}`}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {sermon.view_count.toLocaleString()}회</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {sermon.sermon_date?.slice(0, 10)}</span>
                <span className="bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{sermon.category}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('링크가 복사되었습니다!'); }}>
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>

        {sermon.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{sermon.description}</p>
        )}

        {related && related.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">추천 말씀</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {related.map(s => (
                <SermonCard key={s.id} sermon={{
                  id: s.id,
                  title: s.title,
                  preacher: s.preacher || '',
                  date: s.sermon_date,
                  thumbnailUrl: s.thumbnail_url || undefined,
                  videoUrl: s.video_url || undefined,
                  duration: s.duration || undefined,
                  views: s.view_count,
                  channelId: s.channel_id,
                  category: s.category as '주일말씀' | '수요말씀' | '특별집회',
                  isLive: s.is_live,
                }} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default VodPage;
