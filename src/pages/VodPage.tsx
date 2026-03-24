import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import VideoPlayer from '@/components/VideoPlayer';
import SermonCard from '@/components/SermonCard';
import { sermons, getChannelById } from '@/data/mockData';
import { Eye, Calendar, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const VodPage = () => {
  const { sermonId } = useParams();
  const sermon = sermons.find(s => s.id === sermonId);
  const channel = sermon ? getChannelById(sermon.channelId) : null;
  const related = sermons.filter(s => !s.isLive && s.id !== sermonId).slice(0, 4);

  if (!sermon || !channel) {
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
        <VideoPlayer src={sermon.hlsUrl || ''} poster={sermon.thumbnailUrl} />

        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <img src={channel.logoUrl} alt={channel.name} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <h1 className="font-semibold text-lg text-foreground">{sermon.title}</h1>
              <p className="text-sm text-muted-foreground">{channel.name} · {sermon.preacher}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {sermon.views.toLocaleString()}회</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {sermon.date}</span>
                <span className="bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{sermon.category}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('링크가 복사되었습니다!'); }}>
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>

        <section>
          <h2 className="font-semibold text-sm mb-2 text-foreground">추천 말씀</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {related.map(s => <SermonCard key={s.id} sermon={s} />)}
          </div>
        </section>
      </main>
    </div>
  );
};

export default VodPage;
