import { Link } from 'react-router-dom';
import { Users, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Channel } from '@/data/mockData';

interface ChannelCardProps {
  channel: Channel;
}

const ChannelCard = ({ channel }: ChannelCardProps) => {
  return (
    <Link to={`/channel/${channel.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-accent/50 transition-colors">
      <div className="relative shrink-0">
        <img src={channel.logoUrl} alt={channel.name} className="w-12 h-12 rounded-full object-cover" />
        {channel.isLive && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-live rounded-full flex items-center justify-center">
            <Radio className="w-2.5 h-2.5 text-live-foreground" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-foreground truncate">{channel.name}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="w-3 h-3" /> {channel.subscriberCount.toLocaleString()}명
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={e => e.preventDefault()}>
        구독
      </Button>
    </Link>
  );
};

export default ChannelCard;
