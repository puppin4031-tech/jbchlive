import { useState, useMemo } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Video, ArrowLeft, ExternalLink, Flag, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { clientRateLimit } from '@/lib/security';
import ThumbnailPicker from '@/components/ThumbnailPicker';

const CATEGORIES = ['주일말씀', '전도집회', '조각말씀', '수련회', '동계수련회'];
const PRE_2010 = 'pre-2010';
const NONE = '__none__';

interface SermonForm {
  title: string;
  preacher: string;
  sermon_year: string;   // "" | "pre-2010" | "2026"~"2010"
  sermon_month: string;  // "" | "1"~"12"
  sermon_day: string;    // "" | "1"~"31"
  category: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
}

const emptyForm: SermonForm = {
  title: '',
  preacher: '',
  sermon_year: '',
  sermon_month: '',
  sermon_day: '',
  category: '주일말씀',
  description: '',
  video_url: '',
  thumbnail_url: '',
};

const URL_REGEX = /^https?:\/\/.{3,}$/;

const validateForm = (form: SermonForm): string | null => {
  const title = form.title.trim();
  if (!title) return '제목을 입력해주세요.';
  if (title.length > 200) return '제목은 200자 이하여야 합니다.';
  if (form.preacher.trim().length > 100) return '설교자 이름은 100자 이하여야 합니다.';
  if (form.video_url.trim() && !URL_REGEX.test(form.video_url.trim())) return '유효한 영상 URL을 입력해주세요 (http:// 또는 https://)';
  if (form.description.trim().length > 2000) return '설명은 2000자 이하여야 합니다.';
  return null;
};

const computeSermonDate = (form: SermonForm): string => {
  if (form.sermon_year === PRE_2010) {
    return new Date('2009-12-31T00:00:00Z').toISOString();
  }
  if (form.sermon_year && form.sermon_month && form.sermon_day) {
    const y = parseInt(form.sermon_year, 10);
    const m = parseInt(form.sermon_month, 10);
    const d = parseInt(form.sermon_day, 10);
    return new Date(y, m - 1, d).toISOString();
  }
  return new Date().toISOString();
};

const ManageSermonsPage = () => {
  const { channelId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SermonForm>(emptyForm);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const arr: string[] = [];
    for (let y = currentYear; y >= 2010; y--) arr.push(String(y));
    return arr;
  }, [currentYear]);

  const dayOptions = useMemo(() => {
    if (!form.sermon_year || form.sermon_year === PRE_2010 || !form.sermon_month) {
      return Array.from({ length: 31 }, (_, i) => String(i + 1));
    }
    const y = parseInt(form.sermon_year, 10);
    const m = parseInt(form.sermon_month, 10);
    const last = new Date(y, m, 0).getDate();
    return Array.from({ length: last }, (_, i) => String(i + 1));
  }, [form.sermon_year, form.sermon_month]);

  const monthDayDisabled = form.sermon_year === PRE_2010;

  const { data: channel, isLoading: channelLoading } = useQuery({
    queryKey: ['channel', channelId],
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

  const { data: sermons, isLoading: sermonsLoading } = useQuery({
    queryKey: ['manage-sermons', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('channel_id', channelId!)
        .order('sermon_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
  });

  // Reports received on my channel's sermons
  const sermonIds = (sermons || []).map(s => s.id);
  const { data: receivedReports = [] } = useQuery({
    queryKey: ['received-reports', channelId, sermonIds.join(',')],
    queryFn: async () => {
      if (sermonIds.length === 0) return [];
      const { data } = await supabase
        .from('sermon_reports')
        .select('*, sermons(id, title), sermon_report_replies(*)')
        .in('sermon_id', sermonIds)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: sermonIds.length > 0,
  });

  const reportCountBySermon = receivedReports.reduce<Record<string, number>>((acc, r: any) => {
    if (r.status === 'open') acc[r.sermon_id] = (acc[r.sermon_id] || 0) + 1;
    return acc;
  }, {});

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const postOwnerReply = useMutation({
    mutationFn: async ({ reportId, body }: { reportId: string; body: string }) => {
      if (!user) throw new Error('로그인 필요');
      const { error } = await supabase.from('sermon_report_replies').insert({
        report_id: reportId,
        author_id: user.id,
        author_role: 'owner',
        body: body.trim().slice(0, 2000),
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setReplyTexts(p => ({ ...p, [vars.reportId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['received-reports', channelId] });
      toast.success('답변이 등록되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const REASON_LABELS: Record<string, string> = {
    heresy: '이단 교리',
    inappropriate: '부적절한 영상',
    copyright: '저작권 침해',
    other: '기타',
  };

  const upsertMutation = useMutation({
    mutationFn: async (data: SermonForm & { id?: string }) => {
      const payload = {
        channel_id: channelId!,
        title: data.title.trim(),
        preacher: data.preacher.trim() || null,
        sermon_date: computeSermonDate(data),
        category: data.category,
        description: data.description.trim() || null,
        video_url: data.video_url.trim() || null,
        thumbnail_url: data.thumbnail_url.trim() || null,
        is_live: false,
      };

      if (data.id) {
        const { error } = await supabase.from('sermons').update(payload).eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sermons').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manage-sermons', channelId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? '영상이 수정되었습니다.' : '영상이 등록되었습니다.');
    },
    onError: () => toast.error('오류가 발생했습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sermons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manage-sermons', channelId] });
      toast.success('영상이 삭제되었습니다.');
    },
    onError: () => toast.error('삭제 중 오류가 발생했습니다.'),
  });

  const openEdit = (sermon: any) => {
    setEditingId(sermon.id);
    let sy = '', sm = '', sd = '';
    if (sermon.sermon_date) {
      const dt = new Date(sermon.sermon_date);
      if (dt.getFullYear() < 2010) {
        sy = PRE_2010;
      } else {
        sy = String(dt.getFullYear());
        sm = String(dt.getMonth() + 1);
        sd = String(dt.getDate());
      }
    }
    setForm({
      title: sermon.title,
      preacher: sermon.preacher || '',
      sermon_year: sy,
      sermon_month: sm,
      sermon_day: sd,
      category: CATEGORIES.includes(sermon.category) ? sermon.category : '주일말씀',
      description: sermon.description || '',
      video_url: sermon.video_url || '',
      thumbnail_url: sermon.thumbnail_url || '',
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientRateLimit('sermon-upsert', 5)) {
      toast.error('너무 많은 요청입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const error = validateForm(form);
    if (error) { toast.error(error); return; }
    upsertMutation.mutate(editingId ? { ...form, id: editingId } : form);
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const isOwner = channel?.owner_id === user.id;

  if (channelLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-6 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-40 mb-4" />
          <Skeleton className="h-20 w-full" />
        </main>
      </div>
    );
  }

  if (!channel || !isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          접근 권한이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/my-channel">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <h1 className="text-xl font-bold text-foreground">영상 관리</h1>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> 영상 등록
          </Button>
        </div>

        {sermonsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : !sermons || sermons.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <Video className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">등록된 영상이 없습니다.</p>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> 첫 영상 등록하기
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {sermons.map(s => (
              <Card key={s.id} className="p-3 flex items-center gap-3">
                <div className="w-20 h-12 rounded bg-muted overflow-hidden shrink-0">
                  {s.thumbnail_url ? (
                    <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    {s.is_hidden && <Badge variant="outline" className="text-[10px]"><EyeOff className="w-3 h-3 mr-0.5" />비공개</Badge>}
                    {reportCountBySermon[s.id] > 0 && (
                      <Badge variant="destructive" className="text-[10px]"><Flag className="w-3 h-3 mr-0.5" />{reportCountBySermon[s.id]}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.preacher && `${s.preacher} · `}{s.category} · {s.sermon_date?.slice(0, 10)}
                  </p>
                  {s.video_url && (
                    <p className="text-xs text-primary flex items-center gap-1 mt-0.5 truncate">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{s.video_url}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('이 영상을 삭제하시겠습니까?')) deleteMutation.mutate(s.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {receivedReports.length > 0 && (
          <section className="space-y-3 pt-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Flag className="w-4 h-4 text-destructive" /> 받은 신고 ({receivedReports.length})
            </h2>
            {receivedReports.map((r: any) => (
              <Card key={r.id} className="p-4 space-y-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{REASON_LABELS[r.reason] || r.reason}</Badge>
                    <Badge variant={r.status === 'open' ? 'destructive' : 'secondary'} className="text-xs">
                      {r.status === 'open' ? '처리 대기' : r.status === 'resolved' ? '처리됨' : '기각됨'}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium mt-2">{r.sermons?.title}</p>
                  {r.detail && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.detail}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                </div>

                {r.sermon_report_replies?.length > 0 && (
                  <div className="space-y-2 pl-3 border-l-2 border-muted">
                    {r.sermon_report_replies.map((rep: any) => (
                      <div key={rep.id} className="text-sm">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {rep.author_role === 'admin' ? '관리자' : rep.author_role === 'owner' ? '나 (담당자)' : '신고자'}
                        </span>
                        <p className="whitespace-pre-wrap">{rep.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="답변 입력..."
                    value={replyTexts[r.id] || ''}
                    onChange={e => setReplyTexts(p => ({ ...p, [r.id]: e.target.value }))}
                    maxLength={2000}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => postOwnerReply.mutate({ reportId: r.id, body: replyTexts[r.id] || '' })}
                    disabled={!replyTexts[r.id]?.trim() || postOwnerReply.isPending}
                  >
                    답변
                  </Button>
                </div>
              </Card>
            ))}
          </section>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? '영상 수정' : '영상 등록'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>제목 *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="설교 제목" maxLength={200} />
              </div>
              <div>
                <Label>설교자</Label>
                <Input value={form.preacher} onChange={e => setForm(f => ({ ...f, preacher: e.target.value }))} placeholder="설교자 이름" maxLength={100} />
              </div>
              <div>
                <Label>카테고리</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>날짜 (선택)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={form.sermon_year || NONE}
                    onValueChange={v => {
                      const newY = v === NONE ? '' : v;
                      setForm(f => ({
                        ...f,
                        sermon_year: newY,
                        ...(newY === PRE_2010 ? { sermon_month: '', sermon_day: '' } : {}),
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="년" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>선택 안함</SelectItem>
                      {yearOptions.map(y => (
                        <SelectItem key={y} value={y}>{y}년</SelectItem>
                      ))}
                      <SelectItem value={PRE_2010}>2010년 이전</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.sermon_month || NONE}
                    onValueChange={v => setForm(f => ({ ...f, sermon_month: v === NONE ? '' : v, sermon_day: '' }))}
                    disabled={monthDayDisabled}
                  >
                    <SelectTrigger><SelectValue placeholder="월" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>선택 안함</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(m => (
                        <SelectItem key={m} value={m}>{m}월</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.sermon_day || NONE}
                    onValueChange={v => setForm(f => ({ ...f, sermon_day: v === NONE ? '' : v }))}
                    disabled={monthDayDisabled}
                  >
                    <SelectTrigger><SelectValue placeholder="일" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>선택 안함</SelectItem>
                      {dayOptions.map(d => (
                        <SelectItem key={d} value={d}>{d}일</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  비워두면 등록 시각으로 저장되어 최신순으로 정렬됩니다.
                </p>
              </div>
              <div>
                <Label>영상 URL</Label>
                <Input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://storage.googleapis.com/... 또는 NAS URL" maxLength={2000} />
                <p className="text-xs text-muted-foreground mt-1">GCS, NAS, 자체 서버 등 외부 영상 URL을 입력하세요 (HLS, MP4 지원)</p>
              </div>
              <div>
                <Label>썸네일</Label>
                <ThumbnailPicker
                  videoUrl={form.video_url}
                  value={form.thumbnail_url}
                  onChange={(url) => setForm(f => ({ ...f, thumbnail_url: url }))}
                  channelId={channelId}
                />
              </div>
              <div>
                <Label>설명</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="설교 내용 요약" maxLength={2000} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? '저장 중...' : (editingId ? '수정' : '등록')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ManageSermonsPage;
