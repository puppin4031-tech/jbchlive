import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";

interface CustomVideoPlayerProps {
  /** Ref forwarded to the underlying <video> so the parent can attach hls.js. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Omit when the parent drives the source (e.g. hls.attachMedia). */
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  /** Live streams hide the seek bar and show a red LIVE badge. */
  isLive?: boolean;
  onError?: () => void;
  className?: string;
}

const HIDE_DELAY_MS = 2800;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Video player with fully custom, container-anchored controls.
 * Fullscreen is CSS-only ("fake fullscreen") so the control overlay keeps
 * working identically on iOS, Android and desktop.
 */
const CustomVideoPlayer = ({
  videoRef,
  src,
  poster,
  autoPlay = false,
  isLive = false,
  onError,
  className = "",
}: CustomVideoPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setVisible(false);
    }, HIDE_DELAY_MS);
  }, [videoRef]);

  // Mobile has no hover: tapping the surface toggles the control bar.
  const toggleControls = useCallback(() => {
    if (visible) {
      const video = videoRef.current;
      if (video && !video.paused) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setVisible(false);
        return;
      }
    }
    showControls();
  }, [visible, videoRef, showControls]);


  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setPlaying(true);
      showControls();
    };
    const onPause = () => {
      setPlaying(false);
      setVisible(true);
    };
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
  }, [videoRef, showControls]);

  // Lock background scroll while in CSS fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    video.muted = !video.muted;
  };

  const toggleFullscreen = () => {
    showControls();
    setFullscreen((v) => !v);
  };

  const onSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    const next = Number(event.target.value);
    video.currentTime = next;
    setCurrent(next);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  const buttonClass =
    "flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/90 hover:text-white active:text-white";

  return (
    <div
      ref={containerRef}
      className={
        fullscreen
          ? "fixed inset-0 z-[100] bg-black flex items-center justify-center safe-x safe-bottom"
          : `absolute inset-0 bg-black ${className}`
      }
      onMouseMove={showControls}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        controls={false}
        playsInline
        // @ts-expect-error -- legacy iOS/Android inline playback attributes
        webkit-playsinline="true"
        x5-playsinline="true"
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onError={onError}
        className="absolute inset-0 z-0 w-full h-full object-contain bg-black"
      />

      {/* Tap layer: toggles the control bar (mobile has no hover state). */}
      <button
        type="button"
        aria-label="재생 컨트롤 표시"
        onClick={toggleControls}
        className="absolute inset-0 z-10 w-full h-full bg-transparent pointer-events-auto"
      />

      {/* Control bar anchored to the container, not the video render box. */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 flex items-center gap-1 px-2 pb-1 pt-6 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-200 ${
          visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >

        <button type="button" onClick={togglePlay} aria-label={playing ? "일시정지" : "재생"} className={buttonClass}>
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        {isLive ? (
          <span className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-white">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" />
            LIVE
          </span>
        ) : (
          <>
            <span className="text-[11px] tabular-nums text-white/80 flex-shrink-0">{formatTime(current)}</span>
            <div className="flex-1 flex items-center min-h-[44px] px-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={onSeek}
                aria-label="재생 위치"
                className="w-full h-1 appearance-none rounded-full bg-white/30 cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                  [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, rgba(255,255,255,0.3) ${progress}%)`,
                }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-white/80 flex-shrink-0">{formatTime(duration)}</span>
          </>
        )}

        <button type="button" onClick={toggleMute} aria-label={muted ? "음소거 해제" : "음소거"} className={buttonClass}>
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "전체화면 종료" : "전체화면"}
          className={buttonClass}
        >
          {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default CustomVideoPlayer;
