import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';

interface Ticket {
  id: string; user_id: string; subject: string; body: string;
  category: string; status: string; priority: string;
  created_at: string; updated_at: string;
}
interface Reply {
  id: string; ticket_id: string; author_id: string; author_role: string;
  body: string; created_at: string;
}

const STATUSES = [
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리중' },
  { value: 'resolved', label: '해결' },
  { value: 'closed', label: '종료' },
];

const SupportTicketPage = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!ticketId) return;
    load();
    const ch = supabase
      .channel(`ticket:${ticketId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_replies', filter: `ticket_id=eq.${ticketId}` },
        (p) => setReplies((prev) => [...prev, p.new as Reply]))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
        (p) => setTicket(p.new as Ticket))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticketId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [replies.length]);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase.from('support_tickets').select('*').eq('id', ticketId!).maybeSingle(),
      supabase.from('support_ticket_replies').select('*').eq('ticket_id', ticketId!).order('created_at'),
    ]);
    if (t) setTicket(t as Ticket);
    if (r) {
      setReplies(r as Reply[]);
      const ids = Array.from(new Set([(t as Ticket | null)?.user_id, ...(r as Reply[]).map((x) => x.author_id)].filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
        if (profs) setProfileMap(Object.fromEntries(profs.map((p: any) => [p.user_id, p.display_name || '사용자'])));
      }
    }
    setLoading(false);
  };

  const handleSend = async () => {
    const body = reply.trim();
    if (!body || !user || !ticketId) return;
    if (body.length > 4000) { toast({ title: '4000자 이내로 입력해주세요', variant: 'destructive' }); return; }
    setSending(true);
    const { error } = await supabase.from('support_ticket_replies').insert({
      ticket_id: ticketId, author_id: user.id, author_role: isAdmin ? 'admin' : 'user', body,
    });
    setSending(false);
    if (error) { toast({ title: '전송 실패', description: error.message, variant: 'destructive' }); return; }
    setReply('');
  };

  const handleStatusChange = async (status: string) => {
    if (!ticket) return;
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticket.id);
    if (error) toast({ title: '상태 변경 실패', description: error.message, variant: 'destructive' });
  };

  const handleDelete = async () => {
    if (!ticket || !confirm('문의를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('support_tickets').delete().eq('id', ticket.id);
    if (error) { toast({ title: '삭제 실패', description: error.message, variant: 'destructive' }); return; }
    navigate('/support');
  };

  if (loading) return (
    <div className="min-h-screen bg-background"><Header /><div className="container py-10 text-center text-muted-foreground">불러오는 중...</div></div>
  );
  if (!ticket) return (
    <div className="min-h-screen bg-background"><Header /><div className="container py-10 text-center text-muted-foreground">문의를 찾을 수 없습니다</div></div>
  );

  const closed = ticket.status === 'closed';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-3xl py-4 px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/support')} className="mb-3">
          <ArrowLeft className="w-4 h-4 mr-1" /> 문의 목록
        </Button>

        <div className="p-4 border border-border rounded-lg bg-card mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <Badge>{STATUSES.find((s) => s.value === ticket.status)?.label || ticket.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {profileMap[ticket.user_id] || '사용자'} · {new Date(ticket.created_at).toLocaleString('ko-KR')}
          </p>
          <p className="whitespace-pre-wrap text-sm">{ticket.body}</p>

          {isAdmin && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">상태:</span>
              <Select value={ticket.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive ml-auto">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-4">
          {replies.map((r) => {
            const mine = r.author_id === user?.id;
            return (
              <div key={r.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
                    <span>{profileMap[r.author_id] || '사용자'}</span>
                    {r.author_role === 'admin' && <Badge variant="secondary" className="text-[10px] py-0 h-4">관리자</Badge>}
                    <span>·</span>
                    <span>{new Date(r.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {!closed ? (
          <div className="sticky bottom-0 bg-background pt-2 pb-4 border-t border-border">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="답글을 입력하세요"
              rows={3}
              maxLength={4000}
            />
            <div className="flex justify-end mt-2">
              <Button onClick={handleSend} disabled={sending || !reply.trim()} className="gap-1">
                <Send className="w-4 h-4" /> 전송
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">종료된 문의입니다</p>
        )}
      </div>
    </div>
  );
};

export default SupportTicketPage;
