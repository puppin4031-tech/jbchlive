import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Radio, Eye, Clock, Flag, MoreVertical } from 'lucide-react';
import { extractYouTubeId } from '@/lib/thumbnailUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ReportDialog from '@/components/ReportDialog';

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
  const [reportOpen, setReportOpen] = useState(false);

  // Auto-derive thumbnail: stored → YouTube video URL → placeholder
  let thumbnail = sermon.thumbnailUrl;
  if (!thumbnail && sermon.videoUrl) {
    const ytId = extractYouTubeId(sermon.videoUrl);
    if (ytId) thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }

  return (
    <div className="group block relative">
      <Link to={link} className="block">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
          <img
            src={thumbnail || '/placeholder.svg'}
            alt={sermon.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          {sermon.isLive ? (
            <span className="absolute top-2 left-2 flex items-center gap-1 bg-live text-live-foreground text-base md:text-xs font-bold px-2.5 py-1 rounded-md">
              <Radio className="w-5 h-5 md:w-3 md:h-3 animate-pulse" /> LIVE
            </span>
          ) : sermon.duration ? (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-foreground/80 text-background text-base md:text-xs px-2 py-1 rounded">
              <Clock className="w-5 h-5 md:w-3 md:h-3" /> {sermon.duration}
            </span>
          ) : null}
        </div>
        <div className="mt-3 md:mt-2 flex gap-3 md:gap-2 pr-8">
          {sermon.channelLogoUrl && (
            <img src={sermon.channelLogoUrl} alt={sermon.channelName || ''} className="w-12 h-12 md:w-8 md:h-8 rounded-full object-cover shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <h3 className="font-medium text-lg md:text-sm text-foreground line-clamp-2 leading-snug">{sermon.title}</h3>
            <p className="text-base md:text-xs text-muted-foreground mt-1 md:mt-0.5">
              {sermon.channelName}{sermon.preacher && ` · ${sermon.preacher}`}
            </p>
            <p className="text-base md:text-xs text-muted-foreground flex items-center gap-1 mt-1 md:mt-0.5">
              <Eye className="w-5 h-5 md:w-3 md:h-3" /> {(sermon.views || 0).toLocaleString()}회 · {sermon.date?.slice(0, 10)}
            </p>
          </div>
        </div>
      </Link>
      <div className="absolute bottom-0 right-0 mb-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="메뉴"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              <Flag className="w-4 h-4 mr-2" /> 신고하기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ReportDialog
        sermonId={sermon.id}
        sermonTitle={sermon.title}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
};

export default SermonCard;
