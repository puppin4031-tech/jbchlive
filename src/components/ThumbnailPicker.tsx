import { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff, Check, Upload } from 'lucide-react';
import { detectSource, extractYouTubeId, getYouTubeThumbnails, captureVideoThumbnails, extractDriveId, getDriveThumbnails } from '@/lib/thumbnailUtils';
import { compressImage } from '@/lib/imageCompress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ThumbnailPickerProps {
  videoUrl: string;
  value: string;
  onChange: (url: string) => void;
}

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB original cap

const ThumbnailPicker = ({ videoUrl, value, onChange }: ThumbnailPickerProps) => {
  const { user } = useAuth();
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = videoUrl.trim();
    if (!url || url === lastUrl) return;

    const source = detectSource(url);
    setLoading(true);
    setThumbnails([]);

    if (source === 'youtube') {
      const id = extractYouTubeId(url);
      if (id) {
        const thumbs = getYouTubeThumbnails(id);
        setThumbnails(thumbs);
        if (!value) onChange(thumbs[0]);
      }
      setLoading(false);
      setLastUrl(url);
    } else if (source === 'drive') {
      const id = extractDriveId(url);
      if (id) {
        const thumbs = getDriveThumbnails(id);
        setThumbnails(thumbs);
        if (!value) onChange(thumbs[0]);
      }
      setLoading(false);
      setLastUrl(url);
    } else if (source === 'direct') {
      captureVideoThumbnails(url).then((caps) => {
        setThumbnails(caps);
        if (caps.length > 0 && !value) onChange(caps[0]);
        setLoading(false);
        setLastUrl(url);
      });
    } else {
      setLoading(false);
      setLastUrl(url);
    }
  }, [videoUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      toast.error('원본 이미지는 10MB 이하만 가능합니다.');
      return;
    }

    setUploading(true);
    try {
      const blob = await compressImage(file);
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from('sermon-thumbnails')
        .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
      if (error) throw error;

      const { data } = supabase.storage.from('sermon-thumbnails').getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setUploaded((prev) => [publicUrl, ...prev]);
      onChange(publicUrl);
      toast.success('썸네일이 업로드되었습니다.');
    } catch (err: any) {
      console.error('Thumbnail upload error:', err);
      toast.error(err?.message || '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const source = detectSource(videoUrl);
  const allThumbs = [...uploaded, ...thumbnails];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {allThumbs.length > 0 ? '썸네일을 선택하세요' : '직접 이미지를 업로드할 수 있습니다'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />업로드 중...</>
          ) : (
            <><Upload className="w-3.5 h-3.5 mr-1" />이미지 업로드</>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {videoUrl.trim() && source === 'unsupported' && uploaded.length === 0 && (
        <div className="rounded-lg border border-border p-4 text-center space-y-1">
          <ImageOff className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            이 URL은 자동 썸네일을 지원하지 않습니다. 직접 업로드해주세요.
          </p>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-border p-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">썸네일 생성 중...</span>
        </div>
      )}

      {source === 'drive' && (
        <p className="text-xs text-muted-foreground">
          ※ 구글드라이브 공유 설정이 "링크가 있는 모든 사용자에게 공개"여야 썸네일이 표시됩니다.
        </p>
      )}

      {allThumbs.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {allThumbs.map((thumb, i) => (
            <button
              key={`${thumb}-${i}`}
              type="button"
              onClick={() => onChange(thumb)}
              className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                value === thumb ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground'
              }`}
            >
              <img
                src={thumb}
                alt={`썸네일 ${i + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {value === thumb && (
                <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThumbnailPicker;
