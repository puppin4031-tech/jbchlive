import { useState, useEffect } from 'react';
import { Loader2, ImageOff, Check } from 'lucide-react';
import { detectSource, extractYouTubeId, getYouTubeThumbnails, captureVideoThumbnails } from '@/lib/thumbnailUtils';

interface ThumbnailPickerProps {
  videoUrl: string;
  value: string;
  onChange: (url: string) => void;
}

const ThumbnailPicker = ({ videoUrl, value, onChange }: ThumbnailPickerProps) => {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUrl, setLastUrl] = useState('');

  useEffect(() => {
    const url = videoUrl.trim();
    if (!url || url === lastUrl) return;

    const source = detectSource(url);
    setLoading(true);
    setThumbnails([]);

    if (source === 'youtube') {
      const id = extractYouTubeId(url);
      if (id) {
        const thumbs = getYouTubeThumbnails(id);
        setThumbnails(thumbs);
        if (!value) onChange(thumbs[0]);
      }
      setLoading(false);
      setLastUrl(url);
    } else if (source === 'direct') {
      captureVideoThumbnails(url).then((caps) => {
        setThumbnails(caps);
        if (caps.length > 0 && !value) onChange(caps[0]);
        setLoading(false);
        setLastUrl(url);
      });
    } else {
      setLoading(false);
      setLastUrl(url);
    }
  }, [videoUrl]);

  const source = detectSource(videoUrl);

  if (!videoUrl.trim()) return null;

  if (source === 'unsupported') {
    return (
      <div className="rounded-lg border border-border p-4 text-center space-y-1">
        <ImageOff className="w-6 h-6 mx-auto text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Google Drive 등 외부 서비스는 자동 썸네일을 지원하지 않습니다.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">썸네일 생성 중...</span>
      </div>
    );
  }

  if (thumbnails.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4 text-center">
        <p className="text-xs text-muted-foreground">썸네일을 추출할 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">썸네일을 선택하세요</p>
      <div className="grid grid-cols-2 gap-2">
        {thumbnails.map((thumb, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(thumb)}
            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
              value === thumb ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <img
              src={thumb}
              alt={`썸네일 ${i + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {value === thumb && (
              <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThumbnailPicker;
