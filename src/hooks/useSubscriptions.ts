import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useSubscriptions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isSubscribed = (channelId: string) =>
    subscriptions.some((s) => s.channel_id === channelId);

  const toggleSubscription = useMutation({
    mutationFn: async (channelId: string) => {
      if (!user) throw new Error('Login required');
      const existing = subscriptions.find((s) => s.channel_id === channelId);
      if (existing) {
        const { error } = await supabase
          .from('subscriptions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subscriptions')
          .insert({ user_id: user.id, channel_id: channelId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, channelId) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels-home'] });
    },
  });

  return { subscriptions, isSubscribed, toggleSubscription };
};
