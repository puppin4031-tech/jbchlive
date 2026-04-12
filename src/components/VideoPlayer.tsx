import { useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import { ExternalLink } from 'lucide-react';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
}

type VideoSource =
  | { type: 'youtube'; embedUrl: string }
  | { type: 'google-drive'; embedUrl: string }
  | { type: 'kakao'; embedUrl: string }
  | { type: 'afreeca'; embedUrl: string }
  | { type: 'external-only'; url: string; label: string }
  | { type: 'direct'; url: string }
  | { type: 'none' };

function parseVideoSource(src?: string): VideoSource {
  if (!src) return { type: 'none' };

  // 1. YouTube
  const ytMatch = src.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0` };
  }

  // 2. Google Drive
  const gdMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdMatch) {
    return { type: 'google-drive', embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview` };
  }

  // 3. 카카오TV (cliplink 또는 단축 URL)
  const kakaoClipMatch = src.match(/tv\.kakao\.com\/channel\/\d+\/cliplink\/(\d+)/);
  if (kakaoClipMatch) {
    return { type: 'kakao', embedUrl: `https://tv.kakao.com/embed/player/cliplink/${kakaoClipMatch[1]}` };
  }
  const kakaoShortMatch = src.match(/tv\.kakao\.com\/l\/(\d+)/);
  if (kakaoShortMatch) {
    return { type: 'kakao', embedUrl: `https://tv.kakao.com/embed/player/cliplink/${kakaoShortMatch[1]}` };
  }

  // 4. 아프리카TV
  const afreecaMatch = src.match(/play\.afreecatv\.com\/([^/]+)\/(\d+)/);
  if (afreecaMatch) {
    return { type: 'afreeca', embedUrl: `https://play.afreecatv.com/${afreecaMatch[1]}/${afreecaMatch[2]}/embed` };
  }

  // 5. GoFile (임베딩 불가)
  if (src.match(/gofile\.(me|io)\//)) {
    return { type: 'external-only', url: src, label: 'GoFile에서 보기' };
  }

  // 6. 직접 링크 (HLS, MP4 등)
  return { type: 'direct', url: src };
}

const IFRAME_TYPES = ['youtube', 'google-drive', 'kakao', 'afreeca'];

const VideoPlayer = ({ src, poster, autoPlay = false }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useMemo(() => parseVideoSource(src), [src]);

  useEffect(() => {
    if (source.type !== 'direct') return;
    const video = videoRef.current;
    if (!video) return;

    const url = source.url;
    if (url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) video.play().catch(() => {});
      });
      return () => hls.destroy();
    } else {
      video.src = url;
      if (autoPlay) video.play().catch(() => {});
    }
  }, [source, autoPlay]);

  const isIframe = IFRAME_TYPES.includes(source.type);

  return (
    <div className="relative w-full aspect-video bg-foreground/5 rounded-xl overflow-hidden">
      {isIframe ? (
        <iframe
          src={(source as { embedUrl: string }).embedUrl}
          className="w-full h-full border-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video player"
        />
      ) : source.type === 'external-only' ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-muted/50">
          <p className="text-muted-foreground text-sm">이 영상은 외부 사이트에서만 재생할 수 있습니다.</p>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            {source.label}
          </a>
        </div>
      ) : source.type === 'direct' ? (
        <video
          ref={videoRef}
          poster={poster}
          controls
          playsInline
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          영상을 불러오는 중...
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
