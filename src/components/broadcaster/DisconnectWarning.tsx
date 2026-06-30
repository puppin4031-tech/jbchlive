import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  disconnectedAt: string | null | undefined;
  graceMinutes: number;
  compact?: boolean;
}

/**
 * Shows a yellow warning when RTMP (OBS) input has dropped while live.
 * Auto-stop happens server-side via cron after `graceMinutes`; this is just UX.
 */
const DisconnectWarning = ({ disconnectedAt, graceMinutes, compact }: Props) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!disconnectedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [disconnectedAt]);

  if (!disconnectedAt) return null;

  const startedMs = new Date(disconnectedAt).getTime();
  const deadlineMs = startedMs + graceMinutes * 60_000;
  const remainSec = Math.max(0, Math.ceil((deadlineMs - now) / 1000));

  const msg =
    remainSec > 0
      ? `OBS 연결이 끊겼습니다. ${remainSec}초 내 재연결되지 않으면 자동 종료됩니다.`
      : 'OBS 연결이 끊겼습니다. 곧 자동 종료됩니다…';

  if (compact) {
    return (
      <div className="flex gap-1 text-xs text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="line-clamp-2">{msg}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 flex gap-2 items-start">
      <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
      <p className="text-sm text-yellow-900 dark:text-yellow-200">{msg}</p>
    </div>
  );
};

export default DisconnectWarning;
