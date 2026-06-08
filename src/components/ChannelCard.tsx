import { Link, useNavigate } from 'react-router-dom';
import { Users, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ChannelCardData {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  subscriber_count: number;
  is_live: boolean;
}

interface ChannelCardProps {
  channel: ChannelCardData;
}

const ChannelCard = ({ channel }: ChannelCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isSubscribed, toggleSubscription } = useSubscriptions();
  const subscribed = isSubscribed(channel.id);

  const handleSubscribe = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info('구독은 로그인 후 사용 가능합니다.');
      navigate('/login');
      return;
    }
    toggleSubscription.mutate(channel.id, {
      onSuccess: () => toast.success(subscribed ? '구독이 취소되었습니다.' : '구독되었습니다!'),
      onError: () => toast.error('처리에 실패했습니다.'),
    });
  };

  return (
    <Link to={`/channel/${channel.id}`} className="flex items-center gap-4 md:gap-3 p-5 md:p-3 rounded-xl bg-card hover:bg-accent/50 transition-colors">
      <div className="relative shrink-0">
        <img src={channel.logo_url || '/placeholder.svg'} alt={channel.name} className="w-16 h-16 md:w-12 md:h-12 rounded-full object-cover" />
        {channel.is_live && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-live rounded-full flex items-center justify-center">
            <Radio className="w-2.5 h-2.5 text-live-foreground" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-lg md:text-sm text-foreground truncate">{channel.name}</h3>
        <p className="text-base md:text-xs text-muted-foreground flex items-center gap-1">
          <Users className="w-4 h-4 md:w-3 md:h-3" /> {channel.subscriber_count.toLocaleString()}명
        </p>
      </div>
      <Button
        variant={subscribed ? 'secondary' : 'outline'}
        className="shrink-0 text-base md:text-xs h-12 md:h-8 px-6 md:px-3"
        onClick={handleSubscribe}
        disabled={toggleSubscription.isPending}
      >
        {subscribed ? '구독중' : '구독'}
      </Button>
    </Link>
  );
};

export default ChannelCard;
