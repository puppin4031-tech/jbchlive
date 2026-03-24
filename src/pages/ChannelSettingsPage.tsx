import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const ChannelSettingsPage = () => {
  const { channelId } = useParams();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel-settings', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setDescription(channel.description || '');
      setLogoPreview(channel.logo_url);
    }
  }, [channel]);

  const canEdit = channel && user && (channel.owner_id === user.id || isAdmin);

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

  const updateChannel = useMutation({
    mutationFn: async () => {
      if (!user || !channelId) throw new Error('오류가 발생했습니다');
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 100) throw new Error('채널명은 1~100자여야 합니다');

      let logoUrl = channel?.logo_url || null;

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

      const { error } = await supabase.from('channels').update({
        name: trimmedName,
        description: description.trim().slice(0, 500) || null,
        logo_url: logoUrl,
      }).eq('id', channelId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('채널 정보가 수정되었습니다');
      queryClient.invalidateQueries({ queryKey: ['channel-settings', channelId] });
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (authLoading || isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (channel && !canEdit) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-md mx-auto space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 뒤로
        </button>

        <h1 className="text-xl font-bold text-foreground">채널 설정</h1>

        <Card className="p-5 space-y-4">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary transition-colors bg-muted"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="로고" className="w-full h-full object-cover" />
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
            <p className="text-xs text-muted-foreground">클릭하여 로고 변경 (5MB 이하)</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">교회명 / 채널명</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">설명</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          <Button
            onClick={() => updateChannel.mutate()}
            disabled={!name.trim() || updateChannel.isPending}
            className="w-full"
          >
            {updateChannel.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            저장
          </Button>
        </Card>
      </main>
    </div>
  );
};

export default ChannelSettingsPage;
