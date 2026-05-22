import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { parseRtmpUri } from '@/lib/liveStreamApi';
import { isValidRtmpUri } from '@/lib/liveStreamErrors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gcpState: string;
  pollAttempts: number;
  gcpInputUri: string | null | undefined;
}

const StartLiveDialog = ({ open, onOpenChange, gcpState, pollAttempts, gcpInputUri }: Props) => {
  const isReady = gcpState === 'AWAITING_INPUT' || gcpState === 'STREAMING';
  const rtmp = parseRtmpUri(gcpInputUri);
  const rtmpInvalid = !!gcpInputUri && !isValidRtmpUri(gcpInputUri);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReady ? '🟢 준비 완료' : '🟡 GCP 서버 준비 중'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isReady ? (
            <>
              <p className="text-sm text-foreground font-medium">
                이제 OBS에서 [방송 시작] 버튼을 누르세요.
              </p>
              {rtmpInvalid && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">
                    송출 주소 형식이 올바르지 않습니다. 관리자에게 채널 재설정을 요청해주세요.
                  </span>
                </div>
              )}
              {rtmp && !rtmpInvalid && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">서버:</span>
                    <code className="block mt-1 break-all font-mono">{rtmp.server}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">스트림 키:</span>
                    <code className="block mt-1 break-all font-mono">{rtmp.streamKey}</code>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                현재 상태: <code className="text-foreground">{gcpState}</code>
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              </div>
              <p className="text-sm text-foreground text-center">
                GCP Live Stream 서버를 준비하고 있습니다.<br />
                보통 1~2분 소요됩니다.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                현재 상태: <code className="text-foreground">{gcpState || '시작 중...'}</code> (확인 #{pollAttempts})
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant={isReady ? 'default' : 'outline'} onClick={() => onOpenChange(false)}>
            {isReady ? '확인' : '백그라운드에서 계속 대기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartLiveDialog;
