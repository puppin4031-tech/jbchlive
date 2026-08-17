import { supabase } from '@/integrations/supabase/client';

export const IMAGE_BUCKET = 'community-images';
export const FILE_BUCKET = 'community-files';

export const MAX_IMAGES_PER_POST = 5;
export const MAX_FILES_PER_POST = 3;
export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024; // 10MB original
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per document

export const ALLOWED_DOC_MIMES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ALLOWED_DOC_EXTENSIONS = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'];

/** Videos are never allowed in the community. */
export const isVideoFile = (file: File) =>
  file.type.startsWith('video/') ||
  ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v'].includes(
    (file.name.split('.').pop() || '').toLowerCase()
  );

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

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('압축 실패'))), type, quality);
  });

/** Resize + convert to WebP (falls back to JPEG when unsupported). */
export async function compressToWebp(
  file: File,
  maxSize = 1600,
  targetBytes = 500 * 1024
): Promise<{ blob: Blob; ext: string; mime: string }> {
  const img = await loadImage(file);
  let { width, height } = img;
  const ratio = Math.min(maxSize / width, maxSize / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 컨텍스트를 가져올 수 없습니다.');
  ctx.drawImage(img, 0, 0, width, height);

  const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const mime = supportsWebp ? 'image/webp' : 'image/jpeg';
  const ext = supportsWebp ? 'webp' : 'jpg';

  let last: Blob | null = null;
  for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const blob = await toBlob(canvas, mime, q);
    last = blob;
    if (blob.size <= targetBytes) break;
  }
  return { blob: last!, ext, mime };
}

export async function uploadCommunityImage(file: File, userId: string): Promise<string> {
  if (isVideoFile(file)) throw new Error('영상 파일은 업로드할 수 없습니다.');
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 업로드할 수 있습니다.');
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error('원본 이미지는 10MB 이하만 가능합니다.');

  const { blob, ext, mime } = await compressToWebp(file);
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, blob, { contentType: mime, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

export interface UploadedDoc {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
}

export async function uploadCommunityDoc(file: File, userId: string): Promise<UploadedDoc> {
  if (isVideoFile(file)) throw new Error('영상 파일은 업로드할 수 없습니다.');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_DOC_EXTENSIONS.includes(ext)) {
    throw new Error('PDF, PPT, DOC, XLS 형식만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('첨부 파일은 10MB 이하만 가능합니다.');

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;

  return {
    file_name: file.name,
    file_path: path,
    file_size: file.size,
    mime_type: file.type || `application/${ext}`,
  };
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};
