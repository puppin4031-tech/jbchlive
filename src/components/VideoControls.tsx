import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Live streams hide the seek bar and show a LIVE badge instead. */
  isLive?: boolean;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Compact custom control bar (~60% of the native control size) rendered on top
 * of a native <video>. Used on mobile where the browser chrome cannot be styled.
 */
const VideoControls = ({ videoRef, isLive = false }: VideoControlsProps) => {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpVisibility = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrent(video.currentTime);
    const onMeta = () => setDuration(video.duration);
    const onVolume = () => setMuted(video.muted);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("volumechange", onVolume);

    setPlaying(!video.paused);
    setMuted(video.muted);
    setDuration(video.duration);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("volumechange", onVolume);
    };
  }, [videoRef]);

  useEffect(() => {
    bumpVisibility();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [bumpVisibility]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    bumpVisibility();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    bumpVisibility();
    video.muted = !video.muted;
  };

  const goFullscreen = () => {
    const video = videoRef.current as FullscreenVideo | null;
    if (!video) return;
    bumpVisibility();
    const container = video.parentElement;
    if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
    } else if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
    } else {
      video.webkitEnterFullscreen?.();
    }
  };

  const onSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    bumpVisibility();
    video.currentTime = Number(event.target.value);
    setCurrent(Number(event.target.value));
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <>
      {/* Tap layer to reveal the controls again */}
      <button
        type="button"
        aria-label="컨트롤 표시"
        onClick={() => (visible ? togglePlay() : bumpVisibility())}
        className="absolute inset-0 z-10 w-full h-full bg-transparent"
      />

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center gap-1.5 px-2 h-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "일시정지" : "재생"}
          className="flex-shrink-0 text-white/90 hover:text-white"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {isLive ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-white/90">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
            LIVE
          </span>
        ) : (
          <>
            <span className="text-[10px] tabular-nums text-white/80 flex-shrink-0">{formatTime(current)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={onSeek}
              aria-label="재생 위치"
              className="flex-1 h-[3px] appearance-none rounded-full bg-white/30 accent-primary
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, rgba(255,255,255,0.3) ${progress}%)`,
              }}
            />
            <span className="text-[10px] tabular-nums text-white/80 flex-shrink-0">{formatTime(duration)}</span>
          </>
        )}

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "음소거 해제" : "음소거"}
          className="flex-shrink-0 text-white/90 hover:text-white"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={goFullscreen}
          aria-label="전체화면"
          className="flex-shrink-0 text-white/90 hover:text-white"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </>
  );
};

export default VideoControls;
