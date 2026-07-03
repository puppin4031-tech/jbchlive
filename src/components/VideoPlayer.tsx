import { useEffect, useRef, useMemo, useState } from 'react';
import Hls, { ErrorData } from 'hls.js';
import { ExternalLink, Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
}

type VideoSource =
  | { type: 'youtube'; embedUrl: string }
  | { type: 'google-drive'; embedUrl: string }
  | { type: 'external-only'; url: string; label: string }
  | { type: 'direct'; url: string }
  | { type: 'none' };

function parseVideoSource(src?: string): VideoSource {
  if (!src) return { type: 'none' };

  const ytMatch = src.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0` };
  }

  const gdMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdMatch) {
    return { type: 'google-drive', embedUrl: `https://drive.google.com/file/d/${gdMatch[1]}/preview` };
  }

  if (src.match(/gofile\.(me|io)\//)) {
    return { type: 'external-only', url: src, label: 'GoFile에서 보기' };
  }

  return { type: 'direct', url: src };
}

interface HlsErrorInfo {
  title: string;
  reason: string;
  url?: string;
  httpStatus?: number;
  type: string;
  details: string;
  target?: string;
  responseSnippet?: string;
  timestamp: string;
}

function getHlsErrorUrl(data: ErrorData, fallbackUrl: string) {
  const networkResponseUrl =
    (data.networkDetails as { responseURL?: string } | undefined)?.responseURL ||
    (data.networkDetails as { url?: string } | undefined)?.url;

  return (
    data.response?.url ||
    data.url ||
    data.frag?.url ||
    data.part?.url ||
    data.context?.url ||
    networkResponseUrl ||
    fallbackUrl
  );
}

function getHlsErrorTarget(data: ErrorData) {
  switch (data.details) {
    case Hls.ErrorDetails.MANIFEST_LOAD_ERROR:
    case Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT:
      return 'master-manifest';
    case Hls.ErrorDetails.LEVEL_LOAD_ERROR:
    case Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT:
      return 'variant-playlist';
    case Hls.ErrorDetails.AUDIO_TRACK_LOAD_ERROR:
    case Hls.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT:
      return 'audio-playlist';
    case Hls.ErrorDetails.FRAG_LOAD_ERROR:
    case Hls.ErrorDetails.FRAG_LOAD_TIMEOUT:
      return 'media-segment';
    case Hls.ErrorDetails.KEY_LOAD_ERROR:
    case Hls.ErrorDetails.KEY_LOAD_TIMEOUT:
      return 'encryption-key';
    default:
      return 'unknown';
  }
}

const VideoPlayer = ({ src, poster, autoPlay = false }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useMemo(() => parseVideoSource(src), [src]);
  const [error, setError] = useState<HlsErrorInfo | null>(null);

  useEffect(() => {
    setError(null);
    if (source.type !== 'direct') return;
    const video = videoRef.current;
    if (!video) return;

    const url = source.url;
    if (url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setError(null);
        // Prefer 720p track when available (single-quality provisioning target).
        try {
          const levels = data?.levels ?? hls.levels ?? [];
          const idx720 = levels.findIndex((l) => l?.height === 720);
          if (idx720 >= 0) {
            hls.currentLevel = idx720;
            hls.loadLevel = idx720;
          }
        } catch {
          // If level pinning fails, leave hls.js in auto mode.
        }
        if (autoPlay) video.play().catch(() => {});
      });


      hls.on(Hls.Events.ERROR, async (_evt, data: ErrorData) => {
        if (!data.fatal) return;

        const failedUrl = getHlsErrorUrl(data, url);
        const httpStatus = data.response?.code;
        const target = getHlsErrorTarget(data);
        let responseSnippet: string | undefined;

        // Try to fetch body for diagnostic detail when we know the failing URL.
        try {
          if (failedUrl) {
            const r = await fetch(failedUrl, { method: 'GET' });
            const text = await r.text();
            responseSnippet = text.slice(0, 500);
          }
        } catch {
          // ignore
        }

        let title = '스트림을 불러올 수 없습니다';
        let reason = '알 수 없는 오류가 발생했습니다.';

        if (responseSnippet?.includes('NoSuchBucket')) {
          title = '스트리밍 저장소를 찾을 수 없음 (NoSuchBucket)';
          reason = 'GCP 출력 버킷이 존재하지 않거나 권한이 없습니다. 관리자에게 문의해주세요.';
        } else if (responseSnippet?.includes('AccessDenied') || httpStatus === 403) {
          title = '스트리밍 접근 거부됨 (AccessDenied)';
          reason = '버킷 공개 권한(allUsers: Storage Object Viewer) 설정이 필요합니다.';
        } else if (
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
        ) {
          title = '매니페스트를 찾을 수 없음 (404)';
          reason = '아직 송출이 시작되지 않았거나, HLS 매니페스트가 생성되지 않았습니다.';
        } else if (
          data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT
        ) {
          title = httpStatus === 404 ? '하위 재생목록을 찾을 수 없음 (404)' : '하위 재생목록 로딩 실패';
          reason = '최상위 manifest는 열렸지만 실제 영상 품질 재생목록(.m3u8)을 불러오지 못했습니다.';
        } else if (
          data.details === Hls.ErrorDetails.AUDIO_TRACK_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT
        ) {
          title = httpStatus === 404 ? '오디오 재생목록을 찾을 수 없음 (404)' : '오디오 재생목록 로딩 실패';
          reason = '영상은 열렸지만 오디오용 HLS 재생목록을 불러오지 못했습니다.';
        } else if (
          data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT
        ) {
          title = httpStatus === 404 ? '미디어 세그먼트를 찾을 수 없음 (404)' : '미디어 세그먼트 로딩 실패';
          reason = 'manifest는 정상 응답했지만 실제 재생 데이터(ts/mp4 조각)를 불러오지 못했습니다.';
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          title = '네트워크 오류';
          reason = '스트리밍 서버에 연결하지 못했습니다.';
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          title = '미디어 디코딩 오류';
          reason = '영상 디코딩 중 문제가 발생했습니다.';
        }

        setError({
          title,
          reason,
          url: failedUrl,
          httpStatus,
          type: String(data.type),
          details: String(data.details),
          target,
          responseSnippet,
          timestamp: new Date().toISOString(),
        });
      });

      return () => hls.destroy();
    } else {
      video.src = url;
      if (autoPlay) video.play().catch(() => {});
    }
  }, [source, autoPlay]);

  const handleCopyDebug = async () => {
    if (!error) return;
    const debugText = [
      `[HLS Debug Info]`,
      `Time: ${error.timestamp}`,
      `Title: ${error.title}`,
      `Reason: ${error.reason}`,
      `Target: ${error.target ?? 'unknown'}`,
      `Type: ${error.type}`,
      `Details: ${error.details}`,
      `HTTP Status: ${error.httpStatus ?? 'N/A'}`,
      `URL: ${error.url ?? 'N/A'}`,
      `Source: ${src ?? 'N/A'}`,
      `User-Agent: ${navigator.userAgent}`,
      `Response Snippet:`,
      error.responseSnippet ?? '(none)',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(debugText);
      toast.success('디버그 정보가 복사되었습니다');
    } catch {
      toast.error('복사에 실패했습니다');
    }
  };

  const isIframe = source.type === 'youtube' || source.type === 'google-drive';

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
        <>
          <video
            ref={videoRef}
            poster={poster}
            controls
            playsInline
            className="w-full h-full object-contain bg-black"
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 sm:p-6 overflow-auto">
              <div className="max-w-lg w-full bg-background/95 rounded-xl p-5 sm:p-6 shadow-2xl border border-destructive/30">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-foreground">{error.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{error.reason}</p>
                  </div>
                </div>

                <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1 font-mono break-all max-h-40 overflow-auto">
                  <div><span className="text-muted-foreground">type:</span> {error.type}</div>
                  <div><span className="text-muted-foreground">details:</span> {error.details}</div>
                  {error.target && (
                    <div><span className="text-muted-foreground">target:</span> {error.target}</div>
                  )}
                  {error.httpStatus !== undefined && (
                    <div><span className="text-muted-foreground">http:</span> {error.httpStatus}</div>
                  )}
                  {error.url && <div><span className="text-muted-foreground">url:</span> {error.url}</div>}
                  {error.responseSnippet && (
                    <div className="pt-1 border-t border-border/50">
                      <div className="text-muted-foreground">response:</div>
                      <pre className="whitespace-pre-wrap">{error.responseSnippet.slice(0, 200)}</pre>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleCopyDebug}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors text-sm"
                >
                  <Copy className="w-4 h-4" />
                  디버그 정보 복사
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          영상을 불러오는 중...
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
