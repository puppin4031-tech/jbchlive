import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Loader2, Settings, AlertTriangle, Radio } from 'lucide-react';
import { useBroadcasterChannel, formatElapsed, type BroadcastPhase } from '@/hooks/useBroadcasterChannel';
import StartLiveDialog from './StartLiveDialog';
import StopLiveDialog from './StopLiveDialog';
import KeepaliveDialog from './KeepaliveDialog';


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
  const { channel, phase, gcpState, pollAttempts, startLive, stopLive, lastError, dismissError } = useBroadcasterChannel();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const isLive = phase === 'streaming' || phase === 'awaiting-input' || phase === 'starting';

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Open dialog automatically when start is triggered & not yet ready
  useEffect(() => {
    if (phase === 'starting' || phase === 'awaiting-input') {
      // Only auto-open if user just clicked start (we open manually below)
    }
  }, [phase]);

  if (!channel || phase === 'no-channel' || phase === 'pending-approval') {
    return null;
  }

  const display = phaseDisplay(phase, gcpState);
  const elapsed = isLive ? formatElapsed(channel.live_started_at, now) : null;

  const handleStart = () => {
    startLive.mutate(undefined, {
      onSuccess: () => setStartDialogOpen(true),
    });
  };

  const handleStop = () => {
    stopLive.mutate(undefined, {
      onSuccess: () => setStopDialogOpen(false),
    });
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
          {(lastError || (channel.gcp_last_error && phase === 'error')) && (
            <div className="flex gap-1 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{lastError?.title ?? channel.gcp_last_error}</span>
            </div>
          )}
          <div className="flex gap-2">
            {!channel.is_live ? (
              <Button
                onClick={handleStart}
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
                disabled={stopLive.isPending}
                variant="destructive"
                size="sm"
                className="flex-1 h-10 font-semibold"
              >
                {stopLive.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
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

        {(lastError || channel.gcp_last_error) && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {lastError?.title ?? '송출 오류'}
                </p>
                <p className="text-xs text-foreground">
                  {lastError?.message ?? channel.gcp_last_error}
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
            onClick={handleStart}
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
            disabled={stopLive.isPending}
            variant="destructive"
            size="lg"
            className="w-full h-14 text-base font-bold gap-2"
          >
            {stopLive.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Square className="w-5 h-5" />
            )}
            라이브 종료
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
