import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import VideoPlayer from '@/components/VideoPlayer';
import SermonCard from '@/components/SermonCard';
import { getChannelById, getSermonsByChannel, getLiveSermons } from '@/data/mockData';
import { Share2, Users, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const LivePage = () => {
  const { channelId } = useParams();
  const channel = getChannelById(channelId || '');
  const liveSermons = getLiveSermons();
  const currentLive = liveSermons.find(s => s.channelId === channelId);
  const otherLive = liveSermons.filter(s => s.channelId !== channelId);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('링크가 복사되었습니다!');
  };

  if (!channel || !currentLive) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          현재 라이브 중인 말씀이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-4">
        <VideoPlayer src={currentLive.hlsUrl} poster={currentLive.thumbnailUrl} autoPlay />

        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <img src={channel.logoUrl} alt={channel.name} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <h1 className="font-semibold text-lg text-foreground">{currentLive.title}</h1>
              <p className="text-sm text-muted-foreground">{channel.name} · {currentLive.preacher}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Users className="w-3 h-3" /> {currentLive.views.toLocaleString()}명 시청 중
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleShare} className="shrink-0">
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>

        {otherLive.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">다른 라이브</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {otherLive.map(s => <SermonCard key={s.id} sermon={s} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default LivePage;
