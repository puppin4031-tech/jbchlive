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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ImagePlus, Loader2, ArrowLeft, Copy, Check, ChevronDown, Radio, Eye, EyeOff, Play, Square, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { startChannel as apiStartChannel, stopChannel as apiStopChannel, getStatus as apiGetStatus, parseRtmpUri } from '@/lib/liveStreamApi';

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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [vodTitle, setVodTitle] = useState('');
  const [vodCategory, setVodCategory] = useState('주일말씀');
  const [vodPreacher, setVodPreacher] = useState('');

  // GCP 라이브 시작 폴링 상태
  const [startingDialogOpen, setStartingDialogOpen] = useState(false);
  const [gcpState, setGcpState] = useState<string>('');
  const [pollAttempts, setPollAttempts] = useState(0);

  const { data: channel, isLoading, refetch: refetchChannel } = useQuery({
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

  // GCP 채널 상태 폴링 (라이브 시작 다이얼로그 열려있을 때)
  useEffect(() => {
    if (!startingDialogOpen || !channelId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiGetStatus(channelId);
        if (cancelled) return;
        setGcpState(res.streamingState || 'UNKNOWN');
        setPollAttempts((n) => n + 1);
        // STREAMING이면 OBS가 송출 중. AWAITING_INPUT이면 GCP는 준비 완료, OBS 대기 중.
        if (res.streamingState === 'AWAITING_INPUT' || res.streamingState === 'STREAMING') {
          // 준비 완료 — 다이얼로그는 사용자가 닫게 둠
        }
      } catch (e) {
        console.error('polling error', e);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [startingDialogOpen, channelId]);

  const canEdit = channel && user && (channel.owner_id === user.id || isAdmin);
  const isOwner = channel && user && channel.owner_id === user.id;

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('복사됨!');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('복사에 실패했습니다');
    }
  };

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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startLive = useMutation({
    mutationFn: async () => {
      if (!channelId) throw new Error('채널 ID가 없습니다');
      await apiStartChannel(channelId);
    },
    onSuccess: () => {
      setGcpState('STARTING');
      setPollAttempts(0);
      setStartingDialogOpen(true);
      refetchChannel();
    },
    onError: (e: Error) => toast.error('라이브 시작 실패: ' + e.message),
  });

  const stopLive = useMutation({
    mutationFn: async () => {
      if (!channelId) throw new Error('채널 ID가 없습니다');
      await apiStopChannel(channelId, {
        vodTitle: vodTitle.trim() || undefined,
        vodCategory: vodCategory || undefined,
        vodPreacher: vodPreacher.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('라이브가 종료되고 VOD로 저장되었습니다');
      setStopDialogOpen(false);
      setVodTitle('');
      setVodPreacher('');
      queryClient.invalidateQueries({ queryKey: ['channel-settings', channelId] });
    },
    onError: (e: Error) => toast.error('라이브 종료 실패: ' + e.message),
  });

  if (authLoading || isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (channel && !canEdit) return <Navigate to="/" replace />;

  const rtmpInfo = parseRtmpUri(channel?.gcp_input_uri ?? null);
  const rtmpServer = rtmpInfo?.server || null;
  const streamKey = rtmpInfo?.streamKey || null;
  const maskedKey = streamKey
    ? streamKey.slice(0, 4) + '****' + streamKey.slice(-4)
    : null;

  const isReady = gcpState === 'AWAITING_INPUT' || gcpState === 'STREAMING';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-md mx-auto space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 뒤로
        </button>

        <h1 className="text-xl font-bold text-foreground">채널 설정</h1>

        {/* Channel Info Card */}
        <Card className="p-5 space-y-4">
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
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            <p className="text-xs text-muted-foreground">클릭하여 로고 변경 (5MB 이하)</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">교회명 / 채널명</label>
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">설명</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} />
          </div>

          <Button onClick={() => updateChannel.mutate()} disabled={!name.trim() || updateChannel.isPending} className="w-full">
            {updateChannel.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            저장
          </Button>
        </Card>

        {/* Live Stream Settings Card */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">라이브 스트림 설정</h2>
          </div>

          {/* 비용 안내 */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-foreground space-y-1">
              <p className="font-semibold">방송 종료 시 반드시 [라이브 종료] 버튼을 눌러주세요.</p>
              <p className="text-muted-foreground">누르지 않으면 GCP 서버 비용이 계속 청구됩니다. (30분간 무송출 시 자동 종료)</p>
            </div>
          </div>

          {!channel?.is_approved ? (
            <div className="rounded-lg bg-muted p-4 text-center space-y-2">
              <div className="text-2xl">⏳</div>
              <p className="text-sm font-medium text-foreground">관리자 승인 대기 중...</p>
              <p className="text-xs text-muted-foreground">채널이 승인되면 RTMP 정보가 자동 발급됩니다.</p>
            </div>
          ) : !rtmpServer ? (
            <div className="rounded-lg bg-muted p-4 text-center space-y-2">
              <div className="text-2xl">⚙️</div>
              <p className="text-sm font-medium text-foreground">GCP 인프라 설정 대기 중</p>
              <p className="text-xs text-muted-foreground">관리자에게 GCP 재프로비저닝을 요청하세요.</p>
              {channel.gcp_last_error && (
                <p className="text-xs text-destructive break-words pt-2 border-t border-border">
                  ⚠️ {channel.gcp_last_error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {channel?.is_live && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                  <span className="text-sm font-medium text-destructive">라이브 중</span>
                </div>
              )}

              {/* Live Start/Stop Button */}
              <Button
                onClick={() => {
                  if (channel?.is_live) {
                    setStopDialogOpen(true);
                  } else {
                    startLive.mutate();
                  }
                }}
                disabled={startLive.isPending || stopLive.isPending}
                variant={channel?.is_live ? 'destructive' : 'default'}
                className="w-full h-12 text-base font-semibold gap-2"
              >
                {(startLive.isPending || stopLive.isPending) ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : channel?.is_live ? (
                  <Square className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                {(startLive.isPending || stopLive.isPending)
                  ? '처리 중...'
                  : channel?.is_live
                    ? '라이브 종료'
                    : '라이브 시작'}
              </Button>

              {/* Permanent Live Share Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  라이브 시청 링크 (영구)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2.5 min-w-0">
                    <code className="text-xs font-mono text-foreground break-all">
                      {`${window.location.origin}/live/${channelId}`}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(`${window.location.origin}/live/${channelId}`, 'liveUrl')}
                    className="shrink-0 h-10 w-10"
                    title="복사"
                  >
                    {copiedField === 'liveUrl' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(`/live/${channelId}`, '_blank')}
                    className="shrink-0 h-10 w-10"
                    title="새 탭에서 열기"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  이 링크는 변하지 않습니다. SNS·문자로 공유하세요.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">RTMP 서버 URL</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2.5 min-w-0">
                    <code className="text-sm font-mono text-foreground break-all">{rtmpServer}</code>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => handleCopy(rtmpServer, 'rtmp')} className="shrink-0 h-10 w-10">
                    {copiedField === 'rtmp' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">스트림 키</label>
                {streamKey ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2.5 min-w-0">
                      <code className="text-sm font-mono text-foreground break-all">
                        {showStreamKey ? streamKey : maskedKey}
                      </code>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setShowStreamKey(!showStreamKey)} className="shrink-0 h-10 w-10" title={showStreamKey ? '숨기기' : '전체 보기'}>
                      {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleCopy(streamKey, 'key')} className="shrink-0 h-10 w-10" title="복사">
                      {copiedField === 'key' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    스트림 키를 불러올 수 없습니다. 관리자에게 GCP 재프로비저닝을 요청하세요.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  👁 아이콘을 누르면 전체 키가 표시됩니다. 외부 노출 금지.
                </p>
              </div>

              <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
                  <span>📖 OBS 설정 가이드</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm text-foreground">
                    <p className="font-medium">OBS Studio에서 라이브 방송 시작하기:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                      <li>먼저 위에서 <span className="text-foreground font-medium">[라이브 시작]</span> 버튼을 누르고 GCP 서버가 준비될 때까지(1~2분) 기다립니다</li>
                      <li><span className="text-foreground font-medium">OBS Studio</span>를 실행 → <span className="text-foreground font-medium">설정</span> → <span className="text-foreground font-medium">방송</span></li>
                      <li>서비스를 <span className="text-foreground font-medium">"사용자 정의..."</span>로 변경</li>
                      <li>서버에 위의 <span className="text-foreground font-medium">RTMP 서버 URL</span> 붙여넣기</li>
                      <li>스트림 키에 위의 <span className="text-foreground font-medium">스트림 키</span> 붙여넣기</li>
                      <li><span className="text-foreground font-medium">확인</span> → <span className="text-foreground font-medium">"방송 시작"</span> 클릭</li>
                    </ol>
                    <div className="rounded-md bg-accent/50 p-2.5 text-xs text-muted-foreground">
                      💡 <strong>팁:</strong> OBS가 없다면 <a href="https://obsproject.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">obsproject.com</a>에서 무료로 다운로드할 수 있습니다.
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </Card>
      </main>

      {/* GCP Starting Polling Dialog */}
      <Dialog open={startingDialogOpen} onOpenChange={setStartingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isReady ? '🟢 준비 완료' : '🟡 GCP 서버 준비 중'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isReady ? (
              <>
                <p className="text-sm text-foreground font-medium">
                  이제 OBS에서 [방송 시작] 버튼을 누르세요.
                </p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">서버:</span>
                    <code className="block mt-1 break-all font-mono">{rtmpServer}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">스트림 키:</span>
                    <code className="block mt-1 break-all font-mono">{streamKey}</code>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  현재 상태: <code className="text-foreground">{gcpState}</code>
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                </div>
                <p className="text-sm text-foreground text-center">
                  GCP Live Stream 서버를 준비하고 있습니다.<br />
                  보통 1~2분 소요됩니다.
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  현재 상태: <code className="text-foreground">{gcpState || '시작 중...'}</code> (확인 #{pollAttempts})
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant={isReady ? 'default' : 'outline'} onClick={() => setStartingDialogOpen(false)}>
              {isReady ? '확인 (OBS로 이동)' : '백그라운드에서 계속 대기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop Live & Save VOD Dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>라이브 종료 및 VOD 저장</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              라이브를 종료하면 녹화 영상이 자동으로 VOD로 저장됩니다.
            </p>
            <div className="space-y-2">
              <Label>VOD 제목</Label>
              <Input
                value={vodTitle}
                onChange={e => setVodTitle(e.target.value)}
                placeholder={`라이브 녹화 ${new Date().toLocaleDateString('ko-KR')}`}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={vodCategory} onValueChange={setVodCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="주일말씀">주일말씀</SelectItem>
                  <SelectItem value="수요말씀">수요말씀</SelectItem>
                  <SelectItem value="특별집회">특별집회</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>설교자</Label>
              <Input
                value={vodPreacher}
                onChange={e => setVodPreacher(e.target.value)}
                placeholder="설교자 이름 (선택)"
                maxLength={100}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStopDialogOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => stopLive.mutate()}
              disabled={stopLive.isPending}
              className="gap-2"
            >
              {stopLive.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              종료 및 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChannelSettingsPage;
