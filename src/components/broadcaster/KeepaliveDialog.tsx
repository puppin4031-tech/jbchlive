import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Radio } from 'lucide-react';
import { confirmKeepalive, stopChannel } from '@/lib/liveStreamApi';
import { toast } from 'sonner';

interface Props {
  channelId: string;
  promptSentAt: string | null | undefined;
  confirmedAt: string | null | undefined;
  graceMinutes: number;
}

/** 장시간+저시청자 자동 종료 확인 모달.
 *  promptSentAt이 confirmedAt보다 신규면 모달 표시. */
const KeepaliveDialog = ({ channelId, promptSentAt, confirmedAt, graceMinutes }: Props) => {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());

  const promptMs = promptSentAt ? new Date(promptSentAt).getTime() : 0;
  const confirmedMs = confirmedAt ? new Date(confirmedAt).getTime() : 0;
  const active = promptMs > 0 && promptMs > confirmedMs;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const confirmMut = useMutation({
    mutationFn: () => confirmKeepalive(channelId),
    onSuccess: () => {
      toast.success('계속 송출됩니다');
      qc.invalidateQueries({ queryKey: ['my-channel'] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : '응답 실패';
      toast.error(msg);
    },
  });

  const stopMut = useMutation({
    mutationFn: () => stopChannel(channelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-channel'] });
      qc.invalidateQueries({ queryKey: ['live-channels'] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : '종료 실패';
      toast.error(msg);
    },
  });

  if (!active) return null;

  const graceMs = graceMinutes * 60 * 1000;
  const remainingMs = Math.max(0, promptMs + graceMs - now);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${remainingMin}:${remainingSec.toString().padStart(2, '0')}`;

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-xl">
            <Radio className="w-5 h-5 text-destructive animate-pulse" />
            라이브 계속 진행하시겠습니까?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed pt-2 space-y-3">
            <span className="block">
              장시간 송출 중이며 현재 시청자가 거의 없습니다.
              계속 송출하시려면 [계속 송출]을 눌러주세요.
            </span>
            <span className="block text-destructive font-semibold tabular-nums">
              {countdown} 내 응답이 없으면 자동 종료됩니다.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={(e) => {
              e.preventDefault();
              stopMut.mutate();
            }}
            disabled={stopMut.isPending || confirmMut.isPending}
            className="h-12"
          >
            {stopMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '지금 종료'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmMut.mutate();
            }}
            disabled={confirmMut.isPending || stopMut.isPending}
            className="h-12 font-bold"
          >
            {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '계속 송출'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default KeepaliveDialog;
