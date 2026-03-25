import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/hooks/useFavorites';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const FavoritesPage = () => {
  const { user, loading } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();

  const channelFavs = favorites.filter(f => f.item_type === 'channel');
  const sermonFavs = favorites.filter(f => f.item_type === 'sermon');

  const channelIds = channelFavs.map(f => f.item_id);
  const sermonIds = sermonFavs.map(f => f.item_id);

  const { data: channelDetails } = useQuery({
    queryKey: ['fav-channels', channelIds],
    queryFn: async () => {
      if (channelIds.length === 0) return [];
      const { data } = await supabase.from('channels').select('id, name, logo_url').in('id', channelIds);
      return data || [];
    },
    enabled: channelIds.length > 0,
  });

  const { data: sermonDetails } = useQuery({
    queryKey: ['fav-sermons', sermonIds],
    queryFn: async () => {
      if (sermonIds.length === 0) return [];
      const { data } = await supabase.from('sermons').select('id, title, preacher, thumbnail_url, channel_id').in('id', sermonIds);
      return data || [];
    },
    enabled: sermonIds.length > 0,
  });

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">즐겨찾기</h1>

        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">채널</h2>
          {channelFavs.length === 0 ? (
            <p className="text-muted-foreground text-sm">즐겨찾기한 채널이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {channelFavs.map(f => {
                const ch = channelDetails?.find(c => c.id === f.item_id);
                return (
                  <Card key={f.id} className="p-3 flex items-center gap-3">
                    {ch?.logo_url && (
                      <img src={ch.logo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    )}
                    <Link to={`/channel/${f.item_id}`} className="flex-1 min-w-0">
                      <p className="text-foreground font-medium truncate">{ch?.name || '채널'}</p>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleFavorite.mutate({ itemType: 'channel', itemId: f.item_id })}
                    >
                      <Heart className="w-4 h-4 fill-destructive text-destructive" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">말씀</h2>
          {sermonFavs.length === 0 ? (
            <p className="text-muted-foreground text-sm">즐겨찾기한 말씀이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {sermonFavs.map(f => {
                const s = sermonDetails?.find(d => d.id === f.item_id);
                return (
                  <Card key={f.id} className="p-3 flex items-center gap-3">
                    {s?.thumbnail_url && (
                      <div className="w-16 h-10 rounded bg-muted overflow-hidden shrink-0">
                        <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <Link to={`/vod/${f.item_id}`} className="flex-1 min-w-0">
                      <p className="text-foreground font-medium truncate">{s?.title || '말씀'}</p>
                      {s?.preacher && <p className="text-xs text-muted-foreground">{s.preacher}</p>}
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleFavorite.mutate({ itemType: 'sermon', itemId: f.item_id })}
                    >
                      <Heart className="w-4 h-4 fill-destructive text-destructive" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default FavoritesPage;
