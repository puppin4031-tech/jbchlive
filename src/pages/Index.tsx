import { useState } from 'react';
import Header from '@/components/Header';
import SermonCard from '@/components/SermonCard';
import ChannelCard from '@/components/ChannelCard';
import CategoryTabs from '@/components/CategoryTabs';
import VideoPlayer from '@/components/VideoPlayer';
import { sermons, channels, getLiveSermons, getChannelById } from '@/data/mockData';
import { Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

const categories = ['전체', '주일말씀', '수요말씀', '특별집회'];

const Index = () => {
  const [activeCategory, setActiveCategory] = useState('전체');
  const liveSermons = getLiveSermons();
  const currentLive = liveSermons[0];
  const currentLiveChannel = currentLive ? getChannelById(currentLive.channelId) : null;

  const filteredSermons = sermons.filter(s => {
    if (activeCategory === '전체') return !s.isLive;
    return !s.isLive && s.category === activeCategory;
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 py-4 max-w-5xl mx-auto space-y-6">
        {/* Live Now Section */}
        {currentLive && (
          <section>
            <Link to={`/live/${currentLive.channelId}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center gap-1 bg-live text-live-foreground text-xs font-bold px-2.5 py-1 rounded-md">
                  <Radio className="w-3.5 h-3.5 animate-pulse" /> LIVE NOW
                </span>
              </div>
              <VideoPlayer src={currentLive.hlsUrl} poster={currentLive.thumbnailUrl} />
              <div className="mt-3 flex items-start gap-3">
                {currentLiveChannel && (
                  <img src={currentLiveChannel.logoUrl} alt={currentLiveChannel.name} className="w-10 h-10 rounded-full object-cover" />
                )}
                <div>
                  <h2 className="font-semibold text-base text-foreground">{currentLive.title}</h2>
                  <p className="text-sm text-muted-foreground">{currentLiveChannel?.name} · {currentLive.preacher}</p>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Other Live */}
        {liveSermons.length > 1 && (
          <section>
            <h2 className="font-semibold text-base mb-3 text-foreground">다른 라이브</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {liveSermons.slice(1).map(s => (
                <SermonCard key={s.id} sermon={s} />
              ))}
            </div>
          </section>
        )}

        {/* Popular / Recent Sermons */}
        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">말씀 다시보기</h2>
          <CategoryTabs categories={categories} active={activeCategory} onSelect={setActiveCategory} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
            {filteredSermons.map(s => (
              <SermonCard key={s.id} sermon={s} />
            ))}
          </div>
        </section>

        {/* Channels */}
        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">교회 채널</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {channels.map(ch => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
