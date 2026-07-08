import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, X, Trash2, Radio, Loader2, Ban, EyeOff, Flag } from 'lucide-react';
import { toast } from 'sonner';
import * as liveApi from '@/lib/liveStreamApi';
import ActivityTimeline from '@/components/admin/ActivityTimeline';
import LiveNowPanel from '@/components/admin/LiveNowPanel';

const AdminPage = () => {
  const { isAdmin, loading, user } = useAuth();
  const queryClient = useQueryClient();
  const [newChannel, setNewChannel] = useState({ name: '', description: '', stream_url: '', logo_url: '' });
  const [suspendReasons, setSuspendReasons] = useState<Record<string, string>>({});
  const [hideReasons, setHideReasons] = useState<Record<string, string>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const { data: channels = [] } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: async () => {
      const { data } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: sermons = [] } = useQuery({
    queryKey: ['admin-sermons'],
    queryFn: async () => {
      const { data } = await supabase.from('sermons').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const createChannel = useMutation({
    mutationFn: async () => {
      const name = newChannel.name.trim();
      if (!name || name.length > 100) throw new Error('채널명은 1~100자여야 합니다');
      const description = (newChannel.description || '').trim().slice(0, 500);
      const stream_url = (newChannel.stream_url || '').trim();
      const logo_url = (newChannel.logo_url || '').trim();

      // Validate URLs if provided
      if (stream_url && !/^https?:\/\/.+/.test(stream_url)) throw new Error('유효한 스트림 URL을 입력하세요');
      if (logo_url && !/^https?:\/\/.+/.test(logo_url)) throw new Error('유효한 로고 URL을 입력하세요');

      const { error } = await supabase.from('channels').insert({
        name,
        description: description || null,
        stream_url: stream_url || null,
        logo_url: logo_url || null,
        is_approved: true,
        owner_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('채널이 생성되었습니다');
      setNewChannel({ name: '', description: '', stream_url: '', logo_url: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleApproval = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { error } = await supabase.from('channels').update({ is_approved: approved }).eq('id', id);
      if (error) throw error;
      // 승인 시 자동 GCP 프로비저닝
      if (approved) {
        try {
          await liveApi.provisionChannel(id);
        } catch (e) {
          throw new Error(`승인은 됐지만 GCP 프로비저닝 실패: ${(e as Error).message}`);
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.approved ? '승인 완료 + GCP 라이브 인프라 생성됨' : '승인 취소됨');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprovisionChannel = useMutation({
    mutationFn: async (id: string) => {
      await liveApi.provisionChannel(id);
    },
    onSuccess: () => {
      toast.success('GCP 재프로비저닝 완료. 채널 설정에서 RTMP 정보를 확인하세요.');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(`재프로비저닝 실패: ${e.message}`),
  });

  const stopLive = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await liveApi.stopChannel(id);
    },
    onSuccess: () => {
      toast.success('라이브가 종료되었습니다');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(`라이브 종료 실패: ${e.message}`),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('channels').delete().eq('id', id);
    },
    onSuccess: () => {
      toast.success('채널이 삭제되었습니다');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  // Channel suspension
  const toggleSuspend = useMutation({
    mutationFn: async ({ id, suspend, reason }: { id: string; suspend: boolean; reason?: string }) => {
      const { error } = await supabase.from('channels').update({
        is_suspended: suspend,
        suspended_reason: suspend ? (reason?.trim() || null) : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('채널 상태가 변경되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reports
  const { data: reports = [] } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sermon_reports')
        .select('*, sermons(id, title, channel_id, is_hidden), sermon_report_replies(*)')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const openReports = reports.filter((r: any) => r.status === 'open');

  const updateReportStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('sermon_reports').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('신고 상태가 변경되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });

  const hideSermon = useMutation({
    mutationFn: async ({ id, hide, reason }: { id: string; hide: boolean; reason?: string }) => {
      const { error } = await supabase.from('sermons').update({
        is_hidden: hide,
        hidden_reason: hide ? (reason?.trim() || null) : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('영상 노출 상태가 변경되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['admin-sermons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });

  const postReply = useMutation({
    mutationFn: async ({ reportId, body }: { reportId: string; body: string }) => {
      if (!user) throw new Error('로그인 필요');
      const { error } = await supabase.from('sermon_report_replies').insert({
        report_id: reportId,
        author_id: user.id,
        author_role: 'admin',
        body: body.trim().slice(0, 2000),
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setReplyTexts(p => ({ ...p, [vars.reportId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const REASON_LABELS: Record<string, string> = {
    heresy: '이단 교리',
    inappropriate: '부적절한 영상',
    copyright: '저작권 침해',
    other: '기타',
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const totalViews = sermons.reduce((sum, s) => sum + s.view_count, 0);
  const liveChannels = channels.filter(c => c.is_live).length;
  const pendingChannels = channels.filter(c => !c.is_approved);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">관리자 페이지</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '총 채널', value: channels.length },
            { label: '승인 대기', value: pendingChannels.length },
            { label: '라이브 중', value: liveChannels },
            { label: '총 조회수', value: totalViews.toLocaleString() },
          ].map(stat => (
            <Card key={stat.label} className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue={openReports.length > 0 ? "reports" : (pendingChannels.length > 0 ? "pending" : "channels")}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="pending">
              승인 대기 {pendingChannels.length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{pendingChannels.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="reports">
              신고 관리 {openReports.length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{openReports.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="live">
              라이브 현황 {liveChannels > 0 && <Badge className="bg-live text-live-foreground ml-1 text-xs">{liveChannels}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="channels">전체 채널</TabsTrigger>
            <TabsTrigger value="activity">활동 이력</TabsTrigger>
            <TabsTrigger value="new">새 채널</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-4 space-y-6">
            <LiveNowPanel />
            <div className="border-t pt-6">
              <ChannelHealthPanel />
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityTimeline />
          </TabsContent>

          <TabsContent value="pending" className="space-y-3 mt-4">
            {pendingChannels.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">승인 대기 중인 채널이 없습니다.</p>
            ) : pendingChannels.map(ch => (
              <Card key={ch.id} className="p-4 flex items-center gap-3 border-amber-200 bg-amber-50/30">
                {ch.logo_url && <img src={ch.logo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{ch.name}</span>
                  <p className="text-xs text-muted-foreground truncate">{ch.description || '설명 없음'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => toggleApproval.mutate({ id: ch.id, approved: true })}>
                    <Check className="w-4 h-4 mr-1" /> 승인
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteChannel.mutate(ch.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="reports" className="space-y-3 mt-4">
            {reports.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">접수된 신고가 없습니다.</p>
            ) : reports.map((r: any) => (
              <Card key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Flag className="w-4 h-4 text-destructive shrink-0" />
                      <Badge variant="outline" className="text-xs">{REASON_LABELS[r.reason] || r.reason}</Badge>
                      <Badge variant={r.status === 'open' ? 'destructive' : 'secondary'} className="text-xs">
                        {r.status === 'open' ? '처리 대기' : r.status === 'resolved' ? '처리됨' : '기각됨'}
                      </Badge>
                      {r.sermons?.is_hidden && <Badge variant="outline" className="text-xs"><EyeOff className="w-3 h-3 mr-1" />비공개</Badge>}
                    </div>
                    <p className="text-sm font-medium mt-2 truncate">{r.sermons?.title || '(삭제된 영상)'}</p>
                    {r.detail && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.detail}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                  </div>
                </div>

                {r.sermon_report_replies?.length > 0 && (
                  <div className="space-y-2 pl-3 border-l-2 border-muted">
                    {r.sermon_report_replies.map((rep: any) => (
                      <div key={rep.id} className="text-sm">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {rep.author_role === 'admin' ? '관리자' : rep.author_role === 'owner' ? '채널 담당자' : '신고자'}
                        </span>
                        <p className="whitespace-pre-wrap">{rep.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Textarea
                    placeholder="답변 작성..."
                    value={replyTexts[r.id] || ''}
                    onChange={e => setReplyTexts(p => ({ ...p, [r.id]: e.target.value }))}
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => postReply.mutate({ reportId: r.id, body: replyTexts[r.id] || '' })}
                    disabled={!replyTexts[r.id]?.trim() || postReply.isPending}
                  >
                    답변
                  </Button>
                </div>

                {r.sermons && (
                  <div className="flex gap-2 flex-wrap">
                    {r.sermons.is_hidden ? (
                      <Button size="sm" variant="outline" onClick={() => hideSermon.mutate({ id: r.sermons.id, hide: false })}>
                        영상 공개 복원
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => hideSermon.mutate({ id: r.sermons.id, hide: true, reason: REASON_LABELS[r.reason] })}
                      >
                        <EyeOff className="w-3.5 h-3.5 mr-1" /> 영상 비공개
                      </Button>
                    )}
                    {r.status === 'open' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateReportStatus.mutate({ id: r.id, status: 'resolved' })}>
                          처리 완료
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateReportStatus.mutate({ id: r.id, status: 'dismissed' })}>
                          기각
                        </Button>
                      </>
                    )}
                    {r.status !== 'open' && (
                      <Button size="sm" variant="ghost" onClick={() => updateReportStatus.mutate({ id: r.id, status: 'open' })}>
                        다시 열기
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="channels" className="space-y-3 mt-4">
            {channels.map(ch => {
              const isStopping = stopLive.isPending && stopLive.variables?.id === ch.id;
              const isReprov = reprovisionChannel.isPending && reprovisionChannel.variables === ch.id;
              const canStop = ch.gcp_channel_state !== 'STARTING' && ch.gcp_channel_state !== 'STOPPING';

              return (
                <Card key={ch.id} className={`p-4 space-y-2 ${ch.is_suspended ? 'border-destructive/50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground truncate">{ch.name}</span>
                        {ch.is_approved ? (
                          <Badge variant="secondary" className="text-xs">승인됨</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">미승인</Badge>
                        )}
                        {ch.is_live && <Badge className="bg-live text-live-foreground text-xs">LIVE</Badge>}
                        {ch.is_suspended && <Badge variant="destructive" className="text-xs">정지됨</Badge>}
                        {ch.gcp_input_uri ? (
                          <Badge variant="outline" className="text-xs">GCP ✓</Badge>
                        ) : ch.is_approved ? (
                          <Badge variant="destructive" className="text-xs">GCP 미설정</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{ch.stream_url || '스트림 URL 없음'}</p>
                      {ch.gcp_last_error && (
                        <p className="text-xs text-destructive mt-1 break-words">⚠️ GCP: {ch.gcp_last_error}</p>
                      )}
                      {ch.is_suspended && ch.suspended_reason && (
                        <p className="text-xs text-destructive mt-1">사유: {ch.suspended_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleApproval.mutate({ id: ch.id, approved: !ch.is_approved })}
                        title={ch.is_approved ? '승인 취소' : '승인'}
                      >
                        {ch.is_approved ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </Button>
                      {ch.is_approved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reprovisionChannel.mutate(ch.id)}
                          disabled={isReprov}
                          title="GCP 재프로비저닝"
                        >
                          {isReprov ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                        </Button>
                      )}
                      {ch.is_live && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => stopLive.mutate({ id: ch.id })}
                          disabled={isStopping || !canStop}
                          title={!canStop ? 'GCP 서버 준비/종료 중에는 종료할 수 없습니다' : '라이브 종료'}
                        >
                          {isStopping ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                          {canStop ? '라이브 종료' : '준비 중'}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => deleteChannel.mutate(ch.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {ch.is_suspended ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => toggleSuspend.mutate({ id: ch.id, suspend: false })}
                    >
                      정지 해제
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="정지 사유 (선택)"
                        value={suspendReasons[ch.id] || ''}
                        onChange={e => setSuspendReasons(p => ({ ...p, [ch.id]: e.target.value }))}
                        className="text-xs h-8"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => toggleSuspend.mutate({ id: ch.id, suspend: true, reason: suspendReasons[ch.id] })}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" /> 정지
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
            {channels.length === 0 && (
              <p className="text-center text-muted-foreground py-8">등록된 채널이 없습니다.</p>
            )}
          </TabsContent>

          <TabsContent value="new" className="mt-4">
            <Card className="p-4 space-y-3">
              <Input placeholder="교회명" value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="설명" value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} />
              <Input placeholder="스트림 URL (HLS) - 자동 설정됨" value={newChannel.stream_url} onChange={e => setNewChannel(p => ({ ...p, stream_url: e.target.value }))} />
              <Input placeholder="로고 URL" value={newChannel.logo_url} onChange={e => setNewChannel(p => ({ ...p, logo_url: e.target.value }))} />
              <Button onClick={() => createChannel.mutate()} disabled={!newChannel.name} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> 채널 생성
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminPage;
