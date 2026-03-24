import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useFavorites = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('favorites').select('*').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isFavorited = (itemType: string, itemId: string) =>
    favorites.some(f => f.item_type === itemType && f.item_id === itemId);

  const toggleFavorite = useMutation({
    mutationFn: async ({ itemType, itemId }: { itemType: string; itemId: string }) => {
      if (!user) throw new Error('Login required');
      const existing = favorites.find(f => f.item_type === itemType && f.item_id === itemId);
      if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, item_type: itemType, item_id: itemId });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] }),
  });

  return { favorites, isFavorited, toggleFavorite };
};
