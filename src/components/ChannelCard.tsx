import { Link } from 'react-router-dom';
import { Users, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  return (
    <Link to={`/channel/${channel.id}`} className="flex items-center gap-4 md:gap-3 p-4 md:p-3 rounded-xl bg-card hover:bg-accent/50 transition-colors">
      <div className="relative shrink-0">
        <img src={channel.logo_url || '/placeholder.svg'} alt={channel.name} className="w-14 h-14 md:w-12 md:h-12 rounded-full object-cover" />
        {channel.is_live && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-live rounded-full flex items-center justify-center">
            <Radio className="w-2.5 h-2.5 text-live-foreground" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-base md:text-sm text-foreground truncate">{channel.name}</h3>
        <p className="text-sm md:text-xs text-muted-foreground flex items-center gap-1">
          <Users className="w-3 h-3" /> {channel.subscriber_count.toLocaleString()}명
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 text-sm md:text-xs" onClick={e => e.preventDefault()}>
        구독
      </Button>
    </Link>
  );
};

export default ChannelCard;
