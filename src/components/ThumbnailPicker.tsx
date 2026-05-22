import { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff, Check, Upload, X } from 'lucide-react';
import { detectSource, extractYouTubeId, getYouTubeThumbnails, captureVideoThumbnails, extractDriveId, getDriveThumbnails } from '@/lib/thumbnailUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ThumbnailPickerProps {
  videoUrl: string;
  value: string;
  onChange: (url: string) => void;
  channelId?: string;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const ThumbnailPicker = ({ videoUrl, value, onChange, channelId }: ThumbnailPickerProps) => {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
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

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: '이미지 파일만 업로드 가능합니다', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: '5MB 이하의 이미지만 업로드 가능합니다', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${channelId || 'misc'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('sermon-thumbnails').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('sermon-thumbnails').getPublicUrl(path);
      setUploadedUrl(data.publicUrl);
      onChange(data.publicUrl);
      toast({ title: '썸네일이 업로드되었습니다' });
    } catch (e: any) {
      toast({ title: '업로드 실패', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const source = detectSource(videoUrl);

  return (
    <div className="space-y-3">
      {/* 직접 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-lg border-2 border-dashed border-border p-4 text-center hover:border-primary/50 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">업로드 중...</span>
          </div>
        ) : uploadedUrl ? (
          <div className="space-y-2">
            <div className="relative inline-block">
              <img src={uploadedUrl} alt="업로드됨" className="max-h-32 rounded-md mx-auto" />
              <button
                type="button"
                onClick={() => { setUploadedUrl(''); if (value === uploadedUrl) onChange(''); }}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                aria-label="제거"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-primary hover:underline"
            >
              다른 이미지 선택
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 w-full py-2"
          >
            <Upload className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm text-foreground">이미지 직접 업로드</span>
            <span className="text-xs text-muted-foreground">클릭하거나 드래그&드롭 · 최대 5MB</span>
          </button>
        )}
      </div>

      {/* 자동 추출 영역 */}
      {videoUrl.trim() && (
        <>
          {source === 'unsupported' && (
            <div className="rounded-lg border border-border p-3 text-center">
              <ImageOff className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">
                자동 썸네일을 지원하지 않는 URL입니다. 위에서 직접 업로드해주세요.
              </p>
            </div>
          )}
          {loading && (
            <div className="rounded-lg border border-border p-4 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">자동 썸네일 생성 중...</span>
            </div>
          )}
          {!loading && thumbnails.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">또는 자동 추출된 썸네일을 선택하세요</p>
              {source === 'drive' && (
                <p className="text-xs text-muted-foreground">
                  ※ 구글드라이브 공유 설정이 "링크가 있는 모든 사용자에게 공개"여야 표시됩니다.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {thumbnails.map((thumb, i) => (
                  <button
                    key={i}
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
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {value === thumb && (
                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ThumbnailPicker;
