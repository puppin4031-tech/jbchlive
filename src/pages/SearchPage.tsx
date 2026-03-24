import { useSearchParams } from 'react-router-dom';
import Header from '@/components/Header';
import SermonCard from '@/components/SermonCard';
import ChannelCard from '@/components/ChannelCard';
import { sermons, channels } from '@/data/mockData';
import { Search } from 'lucide-react';

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const q = query.toLowerCase();

  const matchedSermons = sermons.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.preacher.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q)
  );

  const matchedChannels = channels.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q)
  );

  const noResults = matchedSermons.length === 0 && matchedChannels.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-4 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Search className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-semibold text-lg">"{query}" 검색 결과</h1>
        </div>

        {noResults && (
          <p className="text-center text-muted-foreground py-12 text-sm">검색 결과가 없습니다.</p>
        )}

        {matchedChannels.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">채널</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {matchedChannels.map(ch => <ChannelCard key={ch.id} channel={ch} />)}
            </div>
          </section>
        )}

        {matchedSermons.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm mb-2 text-foreground">말씀</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {matchedSermons.map(s => <SermonCard key={s.id} sermon={s} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
