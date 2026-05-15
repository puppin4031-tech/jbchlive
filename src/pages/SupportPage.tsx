import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, MessageSquare } from 'lucide-react';
import { z } from 'zod';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

const ticketSchema = z.object({
  subject: z.string().trim().min(2, '제목은 2자 이상').max(120, '제목은 120자 이내'),
  body: z.string().trim().min(5, '내용은 5자 이상').max(4000, '내용은 4000자 이내'),
  category: z.enum(['general', 'bug', 'streaming', 'account', 'channel_appeal', 'other']),
});

const STATUS_LABELS: Record<string, string> = {
  open: '접수',
  in_progress: '처리중',
  resolved: '해결',
  closed: '종료',
};
const CATEGORY_LABELS: Record<string, string> = {
  general: '일반',
  bug: '오류 신고',
  streaming: '송출 문의',
  account: '계정',
  channel_appeal: '채널 정지 이의신청',
  other: '기타',
};

const SupportPage = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', category: 'general' as const });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchTickets();
  }, [user]);

  const fetchTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setTickets(data as Ticket[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    const parsed = ticketSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: '입력 오류', description: parsed.error.issues[0].message, variant: 'destructive' });
      return;
    }
    if (!user) return;
    setCreating(true);
    const { subject, body, category } = parsed.data;
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([{ subject, body, category, user_id: user.id }])
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast({ title: '문의 등록 실패', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '문의가 등록되었습니다' });
    setShowForm(false);
    setForm({ subject: '', body: '', category: 'general' });
    if (data) navigate(`/support/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-3xl py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{isAdmin ? '전체 문의 관리' : '내 문의'}</h1>
          <Button onClick={() => setShowForm((s) => !s)} className="gap-1">
            <Plus className="w-4 h-4" /> 새 문의
          </Button>
        </div>

        {showForm && (
          <div className="mb-6 p-4 border border-border rounded-lg bg-card space-y-3">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="제목"
              value={form.subject}
              maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
            <Textarea
              placeholder="자세히 설명해주세요"
              rows={6}
              maxLength={4000}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowForm(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? '등록중...' : '등록'}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-muted-foreground">불러오는 중...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
            아직 문의가 없습니다
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/support/${t.id}`}
                  className="block p-4 border border-border rounded-lg bg-card hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {CATEGORY_LABELS[t.category] || t.category} · {new Date(t.updated_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    <Badge variant={t.status === 'resolved' || t.status === 'closed' ? 'secondary' : 'default'}>
                      {STATUS_LABELS[t.status] || t.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SupportPage;
