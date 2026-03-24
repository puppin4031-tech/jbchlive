import Header from '@/components/Header';
import SermonCard from '@/components/SermonCard';
import { getLiveSermons } from '@/data/mockData';
import { Radio } from 'lucide-react';

const LiveListPage = () => {
  const liveSermons = getLiveSermons();

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

        {liveSermons.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">현재 라이브 중인 말씀이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveSermons.map(s => <SermonCard key={s.id} sermon={s} />)}
          </div>
        )}
      </main>
    </div>
  );
};

export default LiveListPage;
