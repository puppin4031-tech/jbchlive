import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/hooks/useFavorites';
import { Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';

const FavoritesPage = () => {
  const { user, loading } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const channelFavs = favorites.filter(f => f.item_type === 'channel');
  const sermonFavs = favorites.filter(f => f.item_type === 'sermon');

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
              {channelFavs.map(f => (
                <Card key={f.id} className="p-3 flex items-center justify-between">
                  <Link to={`/channel/${f.item_id}`} className="text-foreground font-medium hover:underline">
                    채널 보기 →
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleFavorite.mutate({ itemType: 'channel', itemId: f.item_id })}
                  >
                    <Heart className="w-4 h-4 fill-destructive text-destructive" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-base mb-3 text-foreground">말씀</h2>
          {sermonFavs.length === 0 ? (
            <p className="text-muted-foreground text-sm">즐겨찾기한 말씀이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {sermonFavs.map(f => (
                <Card key={f.id} className="p-3 flex items-center justify-between">
                  <Link to={`/vod/${f.item_id}`} className="text-foreground font-medium hover:underline">
                    말씀 보기 →
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleFavorite.mutate({ itemType: 'sermon', itemId: f.item_id })}
                  >
                    <Heart className="w-4 h-4 fill-destructive text-destructive" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default FavoritesPage;
