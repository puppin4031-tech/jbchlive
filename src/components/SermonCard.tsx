import { Link } from 'react-router-dom';
import { Radio, Eye, Clock } from 'lucide-react';
import { type Sermon, getChannelById } from '@/data/mockData';

interface SermonCardProps {
  sermon: Sermon;
}

const SermonCard = ({ sermon }: SermonCardProps) => {
  const channel = getChannelById(sermon.channelId);
  const link = sermon.isLive ? `/live/${sermon.channelId}` : `/vod/${sermon.id}`;

  return (
    <Link to={link} className="group block">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
        <img
          src={sermon.thumbnailUrl}
          alt={sermon.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {sermon.isLive ? (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-live text-live-foreground text-xs font-bold px-2 py-0.5 rounded-md">
            <Radio className="w-3 h-3 animate-pulse" /> LIVE
          </span>
        ) : sermon.duration ? (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-foreground/80 text-background text-xs px-1.5 py-0.5 rounded">
            <Clock className="w-3 h-3" /> {sermon.duration}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        {channel && (
          <img src={channel.logoUrl} alt={channel.name} className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <h3 className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{sermon.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{channel?.name} · {sermon.preacher}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Eye className="w-3 h-3" /> {sermon.views.toLocaleString()}회 · {sermon.date}
          </p>
        </div>
      </div>
    </Link>
  );
};

export default SermonCard;
