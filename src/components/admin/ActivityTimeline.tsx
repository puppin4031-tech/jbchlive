import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ACTION_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  channel_request: { label: '채널 요청', variant: 'outline' },
  channel_approved: { label: '채널 승인', variant: 'secondary' },
  channel_unapproved: { label: '승인 취소', variant: 'destructive' },
  channel_suspended: { label: '채널 정지', variant: 'destructive' },
  channel_unsuspended: { label: '정지 해제', variant: 'secondary' },
  channel_deleted: { label: '채널 삭제', variant: 'destructive' },
  live_started: { label: '라이브 시작', variant: 'default' },
  live_stopped: { label: '라이브 종료', variant: 'secondary' },
  live_error: { label: '라이브 오류', variant: 'destructive' },
  ticket_new: { label: '문의 접수', variant: 'outline' },
  ticket_reply: { label: '문의 답글', variant: 'outline' },
  ticket_status: { label: '문의 상태', variant: 'outline' },
};

const RELEVANT_TYPES = Object.keys(ACTION_META);

const ActivityTimeline = () => {
  const [filterType, setFilterType] = useState<string>('all');

  const { data: events = [] } = useQuery({
    queryKey: ['admin-activity-timeline'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, body, link, related_id, created_at')
        .in('type', RELEVANT_TYPES)
        .order('created_at', { ascending: false })
        .limit(300);
      // De-duplicate same-type/same-related_id within 5s window (admin/owner duplicates)
      const seen = new Map<string, number>();
      const unique: typeof data = [];
      for (const ev of data ?? []) {
        const k = `${ev.type}:${ev.related_id ?? ev.id}`;
        const ts = new Date(ev.created_at).getTime();
        const prev = seen.get(k);
        if (prev && Math.abs(ts - prev) < 5000) continue;
        seen.set(k, ts);
        unique!.push(ev);
      }
      return unique ?? [];
    },
    refetchInterval: 30000,
  });

  const filtered = filterType === 'all' ? events : events.filter(e => e.type === filterType);

  // Group by date (YYYY-MM-DD)
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, ev) => {
    const day = new Date(ev.created_at).toLocaleDateString('ko-KR');
    (acc[day] ||= []).push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">필터:</span>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {RELEVANT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{ACTION_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}건</span>
      </div>

      {Object.keys(grouped).length === 0 && (
        <p className="text-center text-muted-foreground py-8">활동 이력이 없습니다.</p>
      )}

      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-1">
            {day}
          </h3>
          <div className="space-y-2">
            {items.map(ev => {
              const meta = ACTION_META[ev.type] ?? { label: ev.type, variant: 'outline' as const };
              const time = new Date(ev.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              return (
                <Card key={ev.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 mt-0.5">{time}</span>
                    <Badge variant={meta.variant} className="text-xs shrink-0">{meta.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{ev.title}</p>
                      {ev.body && <p className="text-xs text-muted-foreground truncate">{ev.body}</p>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ActivityTimeline;
