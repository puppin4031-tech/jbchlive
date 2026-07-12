import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Stethoscope, RefreshCw } from 'lucide-react';
import ChannelDiagnosticDialog from './ChannelDiagnosticDialog';
import { visibleGcpError } from '@/lib/gcpErrorFilter';

type ProblemChannel = {
  id: string;
  name: string;
  is_live: boolean;
  gcp_channel_state: string | null;
  gcp_last_error: string | null;
  live_started_at: string | null;
  updated_at: string;
};

const isStuckStarting = (ch: ProblemChannel) => {
  if (ch.gcp_channel_state !== 'STARTING' || !ch.live_started_at) return false;
  return Date.now() - new Date(ch.live_started_at).getTime() > 5 * 60 * 1000;
};

const ChannelHealthPanel = () => {
  const [diagnoseTarget, setDiagnoseTarget] = useState<ProblemChannel | null>(null);

  const { data: channels = [], refetch, isFetching } = useQuery({
    queryKey: ['admin-channel-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, is_live, gcp_channel_state, gcp_last_error, live_started_at, updated_at')
        .eq('is_approved', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProblemChannel[];
    },
    refetchInterval: 30000,
  });

  const problems = channels.filter((ch) =>
    visibleGcpError(ch.gcp_last_error) ||
    ch.gcp_channel_state === 'ERROR' ||
    ch.gcp_channel_state === 'RECOVERING' ||
    isStuckStarting(ch)
  );

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              문제 있는 채널 ({problems.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              STARTING 5분 초과 · 최근 GCP 오류 · ERROR/RECOVERING 상태 채널
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {problems.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">
            현재 문제 있는 채널이 없습니다.
          </p>
        ) : (
          problems.map((ch) => {
            const stuck = isStuckStarting(ch);
            const ageMin = ch.live_started_at
              ? Math.floor((Date.now() - new Date(ch.live_started_at).getTime()) / 60000)
              : null;
            return (
              <Card key={ch.id} className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{ch.name}</span>
                  <Badge variant={stuck || ch.gcp_channel_state === 'ERROR' ? 'destructive' : 'outline'}>
                    {ch.gcp_channel_state || 'UNKNOWN'}
                  </Badge>
                  {ch.is_live && <Badge className="bg-live text-live-foreground">LIVE</Badge>}
                  {stuck && ageMin != null && (
                    <Badge variant="destructive">STARTING {ageMin}분 경과</Badge>
                  )}
                </div>
                {visibleGcpError(ch.gcp_last_error) && (
                  <p className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/20 break-words">
                    {visibleGcpError(ch.gcp_last_error)}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setDiagnoseTarget(ch)}>
                    <Stethoscope className="w-3 h-3 mr-1" /> 진단
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <ChannelDiagnosticDialog
        channelId={diagnoseTarget?.id ?? null}
        channelName={diagnoseTarget?.name}
        onClose={() => setDiagnoseTarget(null)}
      />
    </>
  );
};

export default ChannelHealthPanel;
