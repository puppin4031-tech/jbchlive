const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const m = url.match(YT_REGEX);
  return m ? m[1] : null;
}

export function getYouTubeThumbnails(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
  ];
}

export function captureVideoThumbnails(videoUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const captures: string[] = [];
    const percentages = [0.01, 0.25, 0.5, 0.75];
    let idx = 0;

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          captures.push(canvas.toDataURL('image/jpeg', 0.8));
        }
      } catch {
        // CORS or other error — skip this frame
      }

      idx++;
      if (idx < percentages.length) {
        video.currentTime = video.duration * percentages[idx];
      } else {
        video.remove();
        resolve(captures);
      }
    };

    video.addEventListener('seeked', capture);

    video.addEventListener('loadedmetadata', () => {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration * percentages[0];
      } else {
        video.remove();
        resolve([]);
      }
    });

    video.addEventListener('error', () => {
      video.remove();
      resolve([]);
    });

    // Timeout after 15s
    setTimeout(() => {
      video.remove();
      if (captures.length > 0) resolve(captures);
      else resolve([]);
    }, 15000);

    video.src = videoUrl;
  });
}

export type ThumbnailSource = 'youtube' | 'direct' | 'unsupported';

export function detectSource(url: string): ThumbnailSource {
  if (!url.trim()) return 'unsupported';
  if (extractYouTubeId(url)) return 'youtube';
  if (/drive\.google\.com/i.test(url)) return 'unsupported';
  if (/^https?:\/\/.+/i.test(url)) return 'direct';
  return 'unsupported';
}
