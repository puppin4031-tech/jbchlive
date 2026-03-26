import { Link } from 'react-router-dom';
import { Radio, Eye, Clock } from 'lucide-react';
import { extractYouTubeId } from '@/lib/thumbnailUtils';

export interface SermonCardData {
  id: string;
  title: string;
  preacher?: string;
  category: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  date?: string;
  views?: number;
  isLive?: boolean;
  duration?: string;
  channelId: string;
  channelName?: string;
  channelLogoUrl?: string;
}

interface SermonCardProps {
  sermon: SermonCardData;
}

const SermonCard = ({ sermon }: SermonCardProps) => {
  const link = sermon.isLive ? `/live/${sermon.channelId}` : `/vod/${sermon.id}`;

  // Auto-derive thumbnail: stored → YouTube video URL → placeholder
  let thumbnail = sermon.thumbnailUrl;
  if (!thumbnail && sermon.videoUrl) {
    const ytId = extractYouTubeId(sermon.videoUrl);
    if (ytId) thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }

  return (
    <Link to={link} className="group block">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
        <img
          src={thumbnail || '/placeholder.svg'}
          alt={sermon.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {sermon.isLive ? (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-live text-live-foreground text-sm md:text-xs font-bold px-2 py-0.5 rounded-md">
            <Radio className="w-4 h-4 md:w-3 md:h-3 animate-pulse" /> LIVE
          </span>
        ) : sermon.duration ? (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-foreground/80 text-background text-sm md:text-xs px-1.5 py-0.5 rounded">
            <Clock className="w-4 h-4 md:w-3 md:h-3" /> {sermon.duration}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        {sermon.channelLogoUrl && (
          <img src={sermon.channelLogoUrl} alt={sermon.channelName || ''} className="w-10 h-10 md:w-8 md:h-8 rounded-full object-cover shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <h3 className="font-medium text-base md:text-sm text-foreground line-clamp-2 leading-snug">{sermon.title}</h3>
          <p className="text-sm md:text-xs text-muted-foreground mt-0.5">
            {sermon.channelName}{sermon.preacher && ` · ${sermon.preacher}`}
          </p>
          <p className="text-sm md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Eye className="w-4 h-4 md:w-3 md:h-3" /> {(sermon.views || 0).toLocaleString()}회 · {sermon.date?.slice(0, 10)}
          </p>
        </div>
      </div>
    </Link>
  );
};

export default SermonCard;
