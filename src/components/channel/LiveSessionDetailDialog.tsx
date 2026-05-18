import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

interface Sample {
  sampled_at: string;
  viewer_count: number;
}

const LiveSessionDetailDialog = ({ sessionId, open, onClose }: Props) => {
  const { data: session } = useQuery({
    queryKey: ['live-session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: samples, isLoading } = useQuery({
    queryKey: ['live-session-samples', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_viewer_samples')
        .select('sampled_at, viewer_count')
        .eq('session_id', sessionId)
        .order('sampled_at', { ascending: true });
      if (error) throw error;
      return data as Sample[];
    },
    enabled: open,
  });

  const chartData = (samples ?? []).map((s) => ({
    time: new Date(s.sampled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    viewers: s.viewer_count,
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session?.title ?? '라이브 방송 기록'}</DialogTitle>
        </DialogHeader>

        {session && (
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground">최고 동시</p>
              <p className="font-bold text-lg mt-1">{session.peak_viewers}명</p>
            </div>
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground">평균</p>
              <p className="font-bold text-lg mt-1">{Number(session.avg_viewers).toFixed(1)}명</p>
            </div>
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground">샘플 수</p>
              <p className="font-bold text-lg mt-1">{samples?.length ?? 0}</p>
            </div>
          </div>
        )}

        <div className="h-64 w-full mt-2">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              시청자 기록 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}명`, '시청자']}
                />
                <Line type="monotone" dataKey="viewers" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveSessionDetailDialog;
