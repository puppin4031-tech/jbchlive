import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Loader2, Settings, AlertTriangle, Radio, Youtube } from 'lucide-react';
import { useBroadcasterChannel, formatElapsed, type BroadcastPhase } from '@/hooks/useBroadcasterChannel';
import { useBroadcasterPresence } from '@/hooks/useBroadcasterPresence';
import StartLiveDialog from './StartLiveDialog';
import StopLiveDialog from './StopLiveDialog';
import KeepaliveDialog from './KeepaliveDialog';
import DisconnectWarning from './DisconnectWarning';
import BroadcastTypeDialog from './BroadcastTypeDialog';
import YouTubeStartLiveDialog from './YouTubeStartLiveDialog';
import { visibleGcpError } from '@/lib/gcpErrorFilter';
import {
  ytCreateBroadcast,
  ytStartOAuth,
  ytStopBroadcast,
  type CreateBroadcastResult,
} from '@/lib/youtubeLiveApi';



interface PhaseDisplay {
  label: string;
  badgeClass: string;
  description: string;
}

const phaseDisplay = (phase: BroadcastPhase, gcpState: string): PhaseDisplay => {
  switch (phase) {
    case 'streaming':
      return {
        label: '🔴 라이브 중',
        badgeClass: 'bg-destructive text-destructive-foreground',
        description: '시청자에게 송출되고 있습니다',
      };
    case 'awaiting-input':
      return {
        label: '🟦 OBS 대기 중',
        badgeClass: 'bg-blue-500 text-white',
        description: 'OBS에서 [방송 시작]을 눌러주세요',
      };
    case 'starting':
      return {
        label: '🟡 서버 준비 중',
        badgeClass: 'bg-yellow-500 text-black',
        description: `GCP 서버 준비 중 (${gcpState || '...'})`,
      };
    case 'stopping':
      return { label: '⏹ 종료 중', badgeClass: 'bg-muted text-foreground', description: '라이브를 종료하고 있습니다' };
    case 'error':
      return { label: '⚠ 에러', badgeClass: 'bg-destructive text-destructive-foreground', description: '에러가 발생했습니다' };
    case 'pending-approval':
      return { label: '승인 대기', badgeClass: 'bg-muted text-foreground', description: '관리자 승인 대기 중' };
    case 'offline':
    default:
      return { label: '⚫ 오프라인', badgeClass: 'bg-muted text-foreground', description: '라이브 시작 버튼을 눌러주세요' };
  }
};

interface Props {
  variant?: 'inline' | 'compact';
}

const BroadcasterControlPanel = ({ variant = 'inline' }: Props) => {
  const queryClient = useQueryClient();
  const { channel, phase, gcpState, pollAttempts, startLive, stopLive, lastError, dismissError, refresh } = useBroadcasterChannel();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [ytDialogOpen, setYtDialogOpen] = useState(false);
  const [ytData, setYtData] = useState<CreateBroadcastResult | null>(null);
  const [now, setNow] = useState(Date.now());

  const isLive = phase === 'streaming' || phase === 'awaiting-input' || phase === 'starting';
  const currentBroadcastType = (channel as any)?.current_broadcast_type as
    | 'sunday_sermon'
    | 'gathering'
    | null
    | undefined;
  const isYoutubeLive = isLive && currentBroadcastType === 'sunday_sermon';
  const youtubeConnected = !!(channel as any)?.youtube_connected;

  // Layer 1 zombie-stream defense: broadcaster browser heartbeat
  useBroadcasterPresence(channel?.id, isLive && !isYoutubeLive);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const ytCreate = useMutation({
    mutationFn: async () => {
      if (!channel) throw new Error('채널이 없습니다');
      return ytCreateBroadcast(channel.id, `${channel.name} 주일말씀`);
    },
    onSuccess: (data) => {
      setYtData(data);
      setYtDialogOpen(true);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
    },
    onError: (e: Error) => toast.error('YouTube 라이브 생성 실패', { description: e.message }),
  });

  const ytStop = useMutation({
    mutationFn: async () => {
      if (!channel) throw new Error('채널이 없습니다');
      return ytStopBroadcast(channel.id);
    },
    onSuccess: () => {
      toast.success('YouTube 라이브가 종료되었습니다');
      setStopDialogOpen(false);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
    },
    onError: (e: Error) => toast.error('종료 실패', { description: e.message }),
  });

  const connectYoutube = async () => {
    if (!channel) return;
    try {
      const redirectUri = `${window.location.origin}/auth/youtube/callback`;
      const { authUrl } = await ytStartOAuth(channel.id, redirectUri);
      window.location.href = authUrl;
    } catch (e) {
      toast.error('YouTube 연결 실패', { description: (e as Error).message });
    }
  };

  if (!channel || phase === 'no-channel' || phase === 'pending-approval') {
    return null;
  }

  const display = phaseDisplay(phase, gcpState);
  const elapsed = isLive ? formatElapsed(channel.live_started_at, now) : null;
  const canStop = isYoutubeLive || phase === 'awaiting-input' || phase === 'streaming';

  const handleStartClick = () => {
    setTypeDialogOpen(true);
  };

  const handleTypeSelect = (type: 'sunday_sermon' | 'gathering') => {
    setTypeDialogOpen(false);
    if (type === 'sunday_sermon') {
      if (!youtubeConnected) {
        toast.info('먼저 YouTube 계정을 연결해 주세요.', {
          action: { label: '연결하기', onClick: connectYoutube },
        });
        return;
      }
      ytCreate.mutate();
    } else {
      startLive.mutate(undefined, {
        onSuccess: () => setStartDialogOpen(true),
      });
    }
  };

  const handleStop = () => {
    if (isYoutubeLive) {
      ytStop.mutate();
    } else {
      stopLive.mutate(undefined, {
        onSuccess: () => setStopDialogOpen(false),
      });
    }
  };

  // ---------- Compact (floating dock) ----------
  if (variant === 'compact') {
    return (
      <>
        {isLive && (
          <KeepaliveDialog
            channelId={channel.id}
            promptSentAt={channel.keepalive_prompt_sent_at}
            confirmedAt={channel.keepalive_confirmed_at}
            graceMinutes={channel.keepalive_grace_minutes ?? 10}
          />
        )}
        <Card className="p-3 shadow-lg border-2 min-w-[16rem] max-w-xs space-y-2 bg-card/95 backdrop-blur">

          <div className="flex items-center justify-between gap-2">
            <Badge className={`${display.badgeClass} text-xs px-2 py-0.5`}>
              <Radio className="w-3 h-3 mr-1" />
              송출
            </Badge>
            {elapsed && (
              <span className="text-sm font-mono font-semibold text-foreground tabular-nums">{elapsed}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{display.description}</p>
          {isLive && (
            <DisconnectWarning
              disconnectedAt={(channel as any).rtmp_disconnected_at}
              graceMinutes={(channel as any).auto_stop_disconnect_minutes ?? 1}
              compact
            />
          )}
          {(lastError || (visibleGcpError(channel.gcp_last_error) && phase === 'error')) && (
            <div className="flex gap-1 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{lastError?.title ?? visibleGcpError(channel.gcp_last_error)}</span>
            </div>
          )}
          <div className="flex gap-2">
            {!channel.is_live ? (
              <Button
                onClick={handleStartClick}
                disabled={startLive.isPending}
                size="sm"
                className="flex-1 h-10 font-semibold"
              >
                {startLive.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" /> 라이브 시작
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setStopDialogOpen(true)}
                disabled={stopLive.isPending || !canStop}
                variant="destructive"
                size="sm"
                className="flex-1 h-10 font-semibold"
                title={!canStop ? '서버 준비 중에는 종료할 수 없습니다' : '라이브 종료'}
              >
                {stopLive.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !canStop ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 준비 중
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 mr-1" /> 종료
                  </>
                )}
              </Button>
            )}
            <Link to={`/channel/${channel.id}/settings`}>
              <Button size="sm" variant="outline" className="h-10 w-10 p-0" title="채널 설정">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>

        <StartLiveDialog
          open={startDialogOpen}
          onOpenChange={setStartDialogOpen}
          gcpState={gcpState}
          pollAttempts={pollAttempts}
          gcpInputUri={channel.gcp_input_uri}
        />
        <StopLiveDialog
          open={stopDialogOpen}
          onOpenChange={setStopDialogOpen}
          onConfirm={handleStop}
          isPending={stopLive.isPending}
        />
      </>
    );
  }

  // ---------- Inline (MyChannelPage card) ----------
  return (
    <>
      {isLive && (
        <KeepaliveDialog
          channelId={channel.id}
          promptSentAt={channel.keepalive_prompt_sent_at}
          confirmedAt={channel.keepalive_confirmed_at}
          graceMinutes={channel.keepalive_grace_minutes ?? 10}
        />
      )}
      <Card className="p-5 space-y-4">

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge className={`${display.badgeClass} text-sm px-3 py-1`}>{display.label}</Badge>
            {elapsed && (
              <span className="text-lg font-mono font-bold text-foreground tabular-nums">{elapsed}</span>
            )}
          </div>
          <Link to={`/channel/${channel.id}/settings`}>
            <Button size="sm" variant="ghost">
              <Settings className="w-4 h-4 mr-1" /> 설정
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">{display.description}</p>

        {isLive && (
          <DisconnectWarning
            disconnectedAt={(channel as any).rtmp_disconnected_at}
            graceMinutes={(channel as any).auto_stop_disconnect_minutes ?? 1}
          />
        )}

        {(lastError || visibleGcpError(channel.gcp_last_error)) && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {lastError?.title ?? '송출 오류'}
                </p>
                <p className="text-xs text-foreground">
                  {lastError?.message ?? visibleGcpError(channel.gcp_last_error)}
                </p>
                {lastError?.hint && (
                  <p className="text-xs text-muted-foreground">{lastError.hint}</p>
                )}
              </div>
              {lastError && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={dismissError}
                >
                  확인
                </Button>
              )}
            </div>
            {lastError?.raw && (
              <details className="text-[10px] text-muted-foreground pl-6">
                <summary className="cursor-pointer">기술 상세</summary>
                <code className="break-all">{lastError.raw}</code>
              </details>
            )}
          </div>
        )}

        {!channel.is_live ? (
          <Button
            onClick={handleStartClick}
            disabled={startLive.isPending}
            size="lg"
            className="w-full h-14 text-base font-bold gap-2"
          >
            {startLive.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            라이브 시작
          </Button>
        ) : (
          <Button
            onClick={() => setStopDialogOpen(true)}
            disabled={stopLive.isPending || !canStop}
            variant="destructive"
            size="lg"
            className="w-full h-14 text-base font-bold gap-2"
            title={!canStop ? '서버 준비 중에는 종료할 수 없습니다' : '라이브 종료'}
          >
            {stopLive.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : !canStop ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Square className="w-5 h-5" />
            )}
            {canStop ? '라이브 종료' : '서버 준비 중'}
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          ⚠ 종료를 누르지 않으면 GCP 서버 비용이 계속 청구됩니다 (30분간 무송출 시 자동 종료).
        </p>
      </Card>

      <StartLiveDialog
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
        gcpState={gcpState}
        pollAttempts={pollAttempts}
        gcpInputUri={channel.gcp_input_uri}
      />
      <StopLiveDialog
        open={stopDialogOpen}
        onOpenChange={setStopDialogOpen}
        onConfirm={handleStop}
        isPending={stopLive.isPending}
      />
    </>
  );
};

export default BroadcasterControlPanel;
