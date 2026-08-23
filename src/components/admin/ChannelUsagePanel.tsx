import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Users, TrendingUp, Wallet, CloudDownload, Radio } from 'lucide-react';
import {
  estimateCost,
  formatKrw,
  formatGb,
  formatHours,
  DEFAULT_USD_TO_KRW,
  ENCODING_USD_PER_HOUR,
  EGRESS_USD_PER_GB,
  GB_PER_VIEWER_HOUR,
} from '@/lib/gcpCostEstimate';

type Period = 'month' | 'prevMonth' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  month: '이번 달',
  prevMonth: '지난 달',
  all: '전체',
};

const periodRange = (p: Period): { start: Date | null; end: Date | null } => {
  const now = new Date();
  if (p === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  }
  if (p === 'prevMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  return { start: null, end: null };
};

interface SessionRow {
  id: string;
  channel_id: string;
  started_at: string;
  duration_seconds: number | null;
  avg_viewers: number;
  peak_viewers: number;
}

interface ChannelUsage {
  channelId: string;
  name: string;
  sessions: number;
  totalSeconds: number;
  weightedAvgViewers: number;
  peakViewers: number;
  viewerHours: number;
}

const ChannelUsagePanel = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [rateInput, setRateInput] = useState(String(DEFAULT_USD_TO_KRW));
  const usdToKrw = Number(rateInput) > 0 ? Number(rateInput) : DEFAULT_USD_TO_KRW;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-channel-usage', period],
    staleTime: 60_000,
    queryFn: async () => {
      const { start, end } = periodRange(period);

      // 1) Channels (id -> name)
      const { data: channels, error: chErr } = await supabase
        .from('channels')
        .select('id, name');
      if (chErr) throw chErr;

      // 2) Finished sessions in period
      let q = supabase
        .from('live_sessions')
        .select('id, channel_id, started_at, duration_seconds, avg_viewers, peak_viewers')
        .not('ended_at', 'is', null);
      if (start) q = q.gte('started_at', start.toISOString());
      if (end) q = q.lt('started_at', end.toISOString());
      const { data: sessions, error: sErr } = await q;
      if (sErr) throw sErr;
      const sessionRows = (sessions ?? []) as SessionRow[];

      // 3) Viewer samples for those sessions (1-min interval -> viewer-minutes)
      //    Samples are retained ~30 days; fall back to avg_viewers when missing.
      const viewerMinutesBySession = new Map<string, number>();
      const ids = sessionRows.map((s) => s.id);
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data: samples, error: vErr } = await supabase
          .from('live_viewer_samples')
          .select('session_id, viewer_count')
          .in('session_id', ids.slice(i, i + CHUNK));
        if (vErr) throw vErr;
        for (const row of samples ?? []) {
          viewerMinutesBySession.set(
            row.session_id,
            (viewerMinutesBySession.get(row.session_id) ?? 0) + (row.viewer_count ?? 0),
          );
        }
      }

      // 4) Aggregate per channel
      const byChannel = new Map<string, ChannelUsage>();
      const nameOf = (id: string) => channels?.find((c) => c.id === id)?.name ?? '(삭제된 채널)';
      for (const s of sessionRows) {
        const duration = s.duration_seconds ?? 0;
        const entry = byChannel.get(s.channel_id) ?? {
          channelId: s.channel_id,
          name: nameOf(s.channel_id),
          sessions: 0,
          totalSeconds: 0,
          weightedAvgViewers: 0,
          peakViewers: 0,
          viewerHours: 0,
        };
        entry.sessions += 1;
        entry.totalSeconds += duration;
        entry.peakViewers = Math.max(entry.peakViewers, s.peak_viewers ?? 0);

        const sampledMinutes = viewerMinutesBySession.get(s.id);
        entry.viewerHours += sampledMinutes != null
          ? sampledMinutes / 60
          : Number(s.avg_viewers ?? 0) * (duration / 3600);

        byChannel.set(s.channel_id, entry);
      }
      // Weighted average viewers (by duration)
      for (const entry of byChannel.values()) {
        const channelSessions = sessionRows.filter((s) => s.channel_id === entry.channelId);
        const totalDur = channelSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
        entry.weightedAvgViewers = totalDur > 0
          ? channelSessions.reduce((sum, s) => sum + Number(s.avg_viewers ?? 0) * (s.duration_seconds ?? 0), 0) / totalDur
          : 0;
      }

      return Array.from(byChannel.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
    },
  });

  const totals = useMemo(() => {
    const rows = data ?? [];
    return {
      sessions: rows.reduce((s, r) => s + r.sessions, 0),
      totalSeconds: rows.reduce((s, r) => s + r.totalSeconds, 0),
      viewerHours: rows.reduce((s, r) => s + r.viewerHours, 0),
    };
  }, [data]);

  const totalCost = estimateCost(totals.totalSeconds, totals.viewerHours, usdToKrw);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      {/* Period filter + exchange rate */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`min-h-[3rem] px-4 rounded-lg text-base font-medium transition-colors ${
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        <label className="flex items-center gap-2 ml-auto text-base text-muted-foreground">
          환율
          <Input
            type="number"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            className="w-24 h-12 text-base"
            min={1}
          />
          원/$
        </label>
      </div>

      {/* Total summary */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-foreground text-lg">전체 합계 ({PERIOD_LABELS[period]})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={<Radio className="w-4 h-4" />} label="총 방송 횟수" value={`${totals.sessions}회`} />
          <Stat icon={<Clock className="w-4 h-4" />} label="총 송출 시간" value={formatHours(totals.totalSeconds)} />
          <Stat icon={<CloudDownload className="w-4 h-4" />} label="추정 송출량" value={formatGb(totalCost.egressGb)} />
          <Stat icon={<Wallet className="w-4 h-4" />} label="추정 총 비용" value={formatKrw(totalCost.totalKrw)} highlight />
        </div>
        <p className="text-sm text-muted-foreground">
          가동비 {formatKrw(totalCost.encodingUsd * usdToKrw)} + 트래픽비 {formatKrw(totalCost.egressUsd * usdToKrw)}
          {' '}(${totalCost.totalUsd.toFixed(2)})
        </p>
      </Card>

      {/* Per-channel breakdown */}
      {(!data || data.length === 0) ? (
        <p className="text-center text-muted-foreground py-8 text-base">해당 기간에 종료된 방송이 없습니다.</p>
      ) : (
        data.map((row) => {
          const cost = estimateCost(row.totalSeconds, row.viewerHours, usdToKrw);
          return (
            <Card key={row.channelId} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-semibold text-foreground text-lg truncate">{row.name}</h4>
                <span className="font-bold text-primary text-lg">{formatKrw(cost.totalKrw)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat icon={<Radio className="w-4 h-4" />} label="방송 횟수" value={`${row.sessions}회`} />
                <Stat icon={<Clock className="w-4 h-4" />} label="송출 시간" value={formatHours(row.totalSeconds)} />
                <Stat icon={<Users className="w-4 h-4" />} label="평균 시청자" value={`${row.weightedAvgViewers.toFixed(1)}명`} />
                <Stat icon={<TrendingUp className="w-4 h-4" />} label="최고 시청자" value={`${row.peakViewers}명`} />
                <Stat icon={<CloudDownload className="w-4 h-4" />} label="추정 송출량" value={formatGb(cost.egressGb)} />
                <Stat icon={<Wallet className="w-4 h-4" />} label="추정 비용" value={formatKrw(cost.totalKrw)} highlight />
              </div>
              <p className="text-sm text-muted-foreground">
                가동비 {formatKrw(cost.encodingUsd * usdToKrw)} + 트래픽비 {formatKrw(cost.egressUsd * usdToKrw)}
                {' '}(시청 {row.viewerHours.toFixed(1)}시간)
              </p>
            </Card>
          );
        })
      )}

      <p className="text-sm text-muted-foreground leading-relaxed">
        ※ 추정치 기준: 방송 가동비 ${ENCODING_USD_PER_HOUR}/시간, 시청자 트래픽 ${EGRESS_USD_PER_GB}/GB
        (720p 기준 1인 1시간 시청 시 약 {GB_PER_VIEWER_HOUR}GB), 환율 {usdToKrw.toLocaleString('ko-KR')}원/$.
        GCP 콘솔의 실제 청구액과는 약간의 차이가 있을 수 있습니다.
      </p>
    </div>
  );
};

const Stat = ({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) => (
  <div className={`rounded-md p-3 text-center ${highlight ? 'bg-primary/10' : 'bg-muted/50'}`}>
    <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
      {icon}
      <span>{label}</span>
    </div>
    <p className={`font-bold text-lg mt-1 ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
  </div>
);

export default ChannelUsagePanel;
