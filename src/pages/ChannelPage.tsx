import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import Header from '@/components/Header';
import SermonCard from '@/components/SermonCard';
import CategoryTabs from '@/components/CategoryTabs';
import { getChannelById, getSermonsByChannel } from '@/data/mockData';
import { Users, Heart, Radio, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const categories = ['전체', '주일말씀', '수요말씀', '특별집회'];

const ChannelPage = () => {
  const { channelId } = useParams();
  const channel = getChannelById(channelId || '');
  const allSermons = getSermonsByChannel(channelId || '');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [subscribed, setSubscribed] = useState(false);

  const filtered = allSermons.filter(s => {
    if (activeCategory === '전체') return true;
    return s.category === activeCategory;
  });

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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-5">
        {/* Channel Header */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-card">
          <img src={channel.logoUrl} alt={channel.name} className="w-16 h-16 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xl text-foreground">{channel.name}</h1>
              {channel.isLive && (
                <span className="flex items-center gap-1 bg-live text-live-foreground text-xs font-bold px-2 py-0.5 rounded-md">
                  <Radio className="w-3 h-3" /> LIVE
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Users className="w-3 h-3" /> 구독자 {channel.subscriberCount.toLocaleString()}명
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {filtered.map(s => <SermonCard key={s.id} sermon={s} />)}
          </div>
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">해당 카테고리의 말씀이 없습니다.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default ChannelPage;
