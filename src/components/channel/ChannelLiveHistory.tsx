import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Users, TrendingUp, History } from 'lucide-react';
import { useState } from 'react';
import LiveSessionDetailDialog from './LiveSessionDetailDialog';

interface LiveSession {
  id: string;
  channel_id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  peak_viewers: number;
  avg_viewers: number;
  end_reason: string | null;
}

const formatDuration = (sec: number | null) => {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const endReasonLabel: Record<string, string> = {
  manual: '정상 종료',
  auto_idle: '자동 종료(무입력)',
  admin_forced: '관리자 강제 종료',
  scheduled: '예약 종료',
  error: '오류 종료',
};

interface Props {
  channelId: string;
  canSeeDetail: boolean; // owner or admin
  limit?: number;
}

const ChannelLiveHistory = ({ channelId, canSeeDetail, limit = 20 }: Props) => {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['live-sessions', channelId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('*')
        .eq('channel_id', channelId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as LiveSession[];
    },
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        아직 라이브 방송 기록이 없습니다.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-base truncate">
                {s.title ?? '라이브 방송'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(s.started_at)}</p>
              {s.end_reason && (
                <p className="text-xs text-muted-foreground mt-1">
                  {endReasonLabel[s.end_reason] ?? s.end_reason}
                </p>
              )}
            </div>
            {canSeeDetail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenSessionId(s.id)}
              >
                상세
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                <Clock className="w-3 h-3" /> 방송 시간
              </div>
              <p className="font-semibold text-sm mt-0.5">{formatDuration(s.duration_seconds)}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                <TrendingUp className="w-3 h-3" /> 최고 시청자
              </div>
              <p className="font-semibold text-sm mt-0.5">{s.peak_viewers}명</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                <Users className="w-3 h-3" /> 평균 시청자
              </div>
              <p className="font-semibold text-sm mt-0.5">{Number(s.avg_viewers).toFixed(1)}명</p>
            </div>
          </div>
        </Card>
      ))}

      {openSessionId && (
        <LiveSessionDetailDialog
          sessionId={openSessionId}
          open={!!openSessionId}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </div>
  );
};

export default ChannelLiveHistory;
