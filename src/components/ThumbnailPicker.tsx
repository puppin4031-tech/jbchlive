import { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff, Check, Upload } from 'lucide-react';
import {
  detectSource,
  extractYouTubeId,
  getYouTubeThumbnails,
  captureVideoThumbnailAt,
  extractDriveId,
  getDriveThumbnails,
} from '@/lib/thumbnailUtils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface ThumbnailPickerProps {
  videoUrl: string;
  value: string;
  onChange: (url: string) => void;
}

type TimePoint = { key: 'start' | 'middle' | 'end'; label: string; pct: number };
const TIME_POINTS: TimePoint[] = [
  { key: 'start', label: '초반', pct: 0.1 },
  { key: 'middle', label: '중간', pct: 0.5 },
  { key: 'end', label: '후반', pct: 0.9 },
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

const ThumbnailPicker = ({ videoUrl, value, onChange }: ThumbnailPickerProps) => {
  const { user } = useAuth();
  const [presetThumbs, setPresetThumbs] = useState<string[]>([]);
  const [timeCaptures, setTimeCaptures] = useState<Record<string, string>>({});
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [lastUrl, setLastUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const source = detectSource(videoUrl);

  // Reset captures when video URL changes; preload presets for YT/Drive
  useEffect(() => {
    const url = videoUrl.trim();
    if (!url || url === lastUrl) return;

    setTimeCaptures({});
    setPresetThumbs([]);

    if (source === 'youtube') {
      const id = extractYouTubeId(url);
      if (id) {
        const thumbs = getYouTubeThumbnails(id);
        setPresetThumbs(thumbs);
        if (!value) onChange(thumbs[0]);
      }
    } else if (source === 'drive') {
      const id = extractDriveId(url);
      if (id) {
        const thumbs = getDriveThumbnails(id);
        setPresetThumbs(thumbs);
        if (!value) onChange(thumbs[0]);
      }
    }
    setLastUrl(url);
  }, [videoUrl, source]);

  const handleCaptureAt = async (tp: TimePoint) => {
    if (source !== 'direct') return;
    setCapturingKey(tp.key);
    try {
      const dataUrl = await captureVideoThumbnailAt(videoUrl, tp.pct);
      if (!dataUrl) {
        toast({
          title: '캡처 실패',
          description: '영상에서 썸네일을 추출할 수 없습니다. CORS 제한일 수 있습니다.',
          variant: 'destructive',
        });
        return;
      }
      setTimeCaptures((prev) => ({ ...prev, [tp.key]: dataUrl }));
      onChange(dataUrl);
    } finally {
      setCapturingKey(null);
    }
  };

  const handleUpload = async (file: File) => {
    if (!user) {
      toast({ title: '로그인이 필요합니다', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: '이미지 파일만 업로드할 수 있습니다', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: '파일이 너무 큽니다 (최대 5MB)', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('sermon-thumbnails')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('sermon-thumbnails').getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setCustomUrl(publicUrl);
      onChange(publicUrl);
      toast({ title: '썸네일이 업로드되었습니다' });
    } catch (err: any) {
      toast({ title: '업로드 실패', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!videoUrl.trim()) {
    return (
      <UploadButton
        onPick={() => fileInputRef.current?.click()}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onFile={handleUpload}
        customUrl={customUrl}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Time-based capture for direct video */}
      {source === 'direct' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">영상 시점에서 썸네일을 추출하세요</p>
          <div className="flex gap-2">
            {TIME_POINTS.map((tp) => (
              <button
                key={tp.key}
                type="button"
                onClick={() => handleCaptureAt(tp)}
                disabled={capturingKey !== null}
                className="flex-1 py-2 px-3 text-sm rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {capturingKey === tp.key ? (
                  <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                ) : (
                  `${tp.label} (${Math.round(tp.pct * 100)}%)`
                )}
              </button>
            ))}
          </div>
          {Object.keys(timeCaptures).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {TIME_POINTS.map((tp) => {
                const cap = timeCaptures[tp.key];
                if (!cap) return <div key={tp.key} />;
                return (
                  <button
                    key={tp.key}
                    type="button"
                    onClick={() => onChange(cap)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      value === cap
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <img src={cap} alt={tp.label} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 bg-foreground/70 text-background text-[10px] px-1.5 py-0.5 rounded">
                      {tp.label}
                    </span>
                    {value === cap && (
                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Preset thumbnails for YouTube/Drive */}
      {(source === 'youtube' || source === 'drive') && presetThumbs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">자동 추출된 썸네일을 선택하세요</p>
          {source === 'drive' && (
            <p className="text-xs text-muted-foreground">
              ※ 구글드라이브 공유 설정이 "링크가 있는 모든 사용자에게 공개"여야 표시됩니다.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {presetThumbs.map((thumb, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(thumb)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                  value === thumb
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-muted-foreground'
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
        </div>
      )}

      {source === 'unsupported' && (
        <div className="rounded-lg border border-border p-4 text-center space-y-1">
          <ImageOff className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            이 영상 소스는 자동 썸네일을 지원하지 않습니다. 직접 업로드해 주세요.
          </p>
        </div>
      )}

      {/* Custom upload — always available */}
      <UploadButton
        onPick={() => fileInputRef.current?.click()}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onFile={handleUpload}
        customUrl={customUrl}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

interface UploadButtonProps {
  onPick: () => void;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  customUrl: string;
  value: string;
  onChange: (url: string) => void;
}

const UploadButton = ({ onPick, uploading, fileInputRef, onFile, customUrl, value, onChange }: UploadButtonProps) => (
  <div className="space-y-2 pt-2 border-t border-border">
    <p className="text-xs text-muted-foreground">직접 이미지 업로드 (최대 5MB)</p>
    <button
      type="button"
      onClick={onPick}
      disabled={uploading}
      className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm rounded-lg border border-dashed border-border bg-card hover:bg-muted disabled:opacity-50 transition-colors"
    >
      {uploading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> 업로드 중...
        </>
      ) : (
        <>
          <Upload className="w-4 h-4" /> 내 이미지 업로드
        </>
      )}
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
      }}
    />
    {customUrl && (
      <button
        type="button"
        onClick={() => onChange(customUrl)}
        className={`relative aspect-video w-full max-w-xs rounded-lg overflow-hidden border-2 transition-all ${
          value === customUrl
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-border hover:border-muted-foreground'
        }`}
      >
        <img src={customUrl} alt="업로드된 썸네일" className="w-full h-full object-cover" />
        {value === customUrl && (
          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
            <Check className="w-3 h-3" />
          </div>
        )}
      </button>
    )}
  </div>
);

export default ThumbnailPicker;
