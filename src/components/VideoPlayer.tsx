import { useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
}

type VideoSource =
  | { type: 'youtube'; embedUrl: string }
  | { type: 'google-drive'; embedUrl: string }
  | { type: 'direct'; url: string }
  | { type: 'none' };

function parseVideoSource(src?: string): VideoSource {
  if (!src) return { type: 'none' };

  // YouTube: various URL formats
  const ytMatch = src.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0` };
  }

  // Google Drive: extract file ID
  const gdMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdMatch) {
    return { type: 'google-drive', embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview` };
  }

  // GoFile: gofile.me or gofile.io links
  if (src.match(/gofile\.(me|io)\//)) {
    return { type: 'google-drive', embedUrl: src };
  }

  // Direct video URL (MP4, HLS, etc.)
  return { type: 'direct', url: src };
}

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

  return (
    <div className="relative w-full aspect-video bg-foreground/5 rounded-xl overflow-hidden">
      {source.type === 'youtube' || source.type === 'google-drive' ? (
        <iframe
          src={source.embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video player"
        />
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
