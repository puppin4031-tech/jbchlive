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

export function extractDriveId(url: string): string | null {
  // Patterns: /file/d/{ID}/, ?id={ID}, /folders/{ID}
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/folders\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function getDriveThumbnails(fileId: string): string[] {
  return [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1280`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w640`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w320`,
  ];
}

export function captureVideoThumbnailAt(videoUrl: string, percentage: number): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      video.remove();
      resolve(val);
    };

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        finish(null);
      }
    });

    video.addEventListener('loadedmetadata', () => {
      if (video.duration && isFinite(video.duration)) {
        const pct = Math.max(0, Math.min(1, percentage));
        // Avoid seeking past end
        video.currentTime = Math.min(video.duration * pct, Math.max(0, video.duration - 0.1));
      } else {
        finish(null);
      }
    });

    video.addEventListener('error', () => finish(null));

    setTimeout(() => finish(null), 15000);

    video.src = videoUrl;
  });
}

// Legacy multi-capture (kept for backward compatibility if needed elsewhere)
export async function captureVideoThumbnails(videoUrl: string): Promise<string[]> {
  const points = [0.1, 0.5, 0.9];
  const results = await Promise.all(points.map((p) => captureVideoThumbnailAt(videoUrl, p)));
  return results.filter((x): x is string => !!x);
}


export type ThumbnailSource = 'youtube' | 'drive' | 'direct' | 'unsupported';

export function detectSource(url: string): ThumbnailSource {
  if (!url.trim()) return 'unsupported';
  if (extractYouTubeId(url)) return 'youtube';
  if (/drive\.google\.com/i.test(url)) {
    return extractDriveId(url) ? 'drive' : 'unsupported';
  }
  if (/^https?:\/\/.+/i.test(url)) return 'direct';
  return 'unsupported';
}
