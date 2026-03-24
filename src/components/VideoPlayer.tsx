import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
}

const VideoPlayer = ({ src, poster, autoPlay = false }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (src.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) video.play().catch(() => {});
      });
      return () => hls.destroy();
    } else {
      video.src = src;
      if (autoPlay) video.play().catch(() => {});
    }
  }, [src, autoPlay]);

  return (
    <div className="relative w-full aspect-video bg-foreground/5 rounded-xl overflow-hidden">
      {src ? (
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
