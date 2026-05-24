// Client-side image compression using Canvas API.
// No external deps. Returns a JPEG Blob.

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  targetBytes?: number;
  initialQuality?: number;
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다.'));
    };
    img.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('압축 실패'))),
      'image/jpeg',
      quality
    );
  });

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<Blob> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    targetBytes = 500 * 1024,
    initialQuality = 0.82,
  } = opts;

  const img = await loadImage(file);
  let { width, height } = img;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 컨텍스트를 가져올 수 없습니다.');
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [initialQuality, 0.7, 0.6, 0.5, 0.4];
  let last: Blob | null = null;
  for (const q of qualities) {
    const blob = await canvasToBlob(canvas, q);
    last = blob;
    if (blob.size <= targetBytes) return blob;
  }
  return last!;
}
