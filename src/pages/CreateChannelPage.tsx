import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const CreateChannelPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const createChannel = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('로그인이 필요합니다');
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 100) throw new Error('채널명은 1~100자여야 합니다');

      let logoUrl: string | null = null;

      // Upload logo if selected
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('channel-logos')
          .upload(path, logoFile, { contentType: logoFile.type });
        if (uploadError) throw new Error('로고 업로드 실패: ' + uploadError.message);

        const { data: urlData } = supabase.storage
          .from('channel-logos')
          .getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from('channels').insert({
        name: trimmedName,
        description: description.trim().slice(0, 500) || null,
        logo_url: logoUrl,
        owner_id: user.id,
        is_approved: false, // 관리자 승인 대기
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-12 max-w-md mx-auto text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">채널 개설 신청 완료!</h1>
          <p className="text-muted-foreground text-sm">
            관리자 승인 후 채널이 활성화됩니다.<br />
            승인까지 잠시 기다려주세요.
          </p>
          <Button onClick={() => navigate('/')} variant="outline">홈으로 돌아가기</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-md mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">채널 개설</h1>
        <p className="text-sm text-muted-foreground">
          채널을 개설하면 관리자 승인 후 활성화됩니다.
        </p>

        <Card className="p-5 space-y-4">
          {/* Logo Upload */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary transition-colors bg-muted"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="로고 미리보기" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground">교회 로고 (선택, 5MB 이하)</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">교회명 / 채널명 *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 파주중앙침례교회"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">설명</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="채널 소개를 입력해주세요"
              maxLength={500}
              rows={3}
            />
          </div>

          <Button
            onClick={() => createChannel.mutate()}
            disabled={!name.trim() || createChannel.isPending}
            className="w-full"
          >
            {createChannel.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : null}
            채널 개설 신청
          </Button>
        </Card>
      </main>
    </div>
  );
};

export default CreateChannelPage;
