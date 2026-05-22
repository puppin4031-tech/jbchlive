import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Radio, Clock, TrendingUp, Users } from 'lucide-react';

interface Props {
  channelId: string;
}

const formatHours = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};

const ChannelLiveStats = ({ channelId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ['channel-live-stats', channelId],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from('live_sessions')
        .select('duration_seconds, peak_viewers, avg_viewers, ended_at')
        .eq('channel_id', channelId)
        .not('ended_at', 'is', null);
      if (error) throw error;

      const total = sessions.length;
      const totalSeconds = sessions.reduce((s, x) => s + (x.duration_seconds ?? 0), 0);
      const allTimePeak = sessions.reduce((m, x) => Math.max(m, x.peak_viewers ?? 0), 0);
      const avgOfAvg = total > 0
        ? sessions.reduce((s, x) => s + Number(x.avg_viewers ?? 0), 0) / total
        : 0;
      return { total, totalSeconds, allTimePeak, avgOfAvg };
    },
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }
  if (!data) return null;

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-foreground mb-3">채널 통계</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Radio className="w-4 h-4" />} label="총 방송 횟수" value={`${data.total}회`} />
        <Stat icon={<Clock className="w-4 h-4" />} label="총 방송 시간" value={formatHours(data.totalSeconds)} />
        <Stat icon={<TrendingUp className="w-4 h-4" />} label="역대 최고 시청자" value={`${data.allTimePeak}명`} />
        <Stat icon={<Users className="w-4 h-4" />} label="평균 시청자" value={`${data.avgOfAvg.toFixed(1)}명`} />
      </div>
    </Card>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-muted/50 rounded-md p-3 text-center">
    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
      {icon}
      <span>{label}</span>
    </div>
    <p className="font-bold text-base mt-1 text-foreground">{value}</p>
  </div>
);

export default ChannelLiveStats;
