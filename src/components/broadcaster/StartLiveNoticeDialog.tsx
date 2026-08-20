import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Clock } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}

/** Pre-start policy notice: 180-minute hard cap on live broadcasts. */
const StartLiveNoticeDialog = ({ open, onOpenChange, onConfirm, isPending }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-primary" />
          라이브 송출 정책 안내
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2 text-base leading-relaxed">
        <p>
          라이브의 송출 시간은 <strong>180분</strong>을 기준으로 하고 있습니다.
        </p>
        <p>180분이 초과된 방송은 강제 종료됨을 인지해주시기 바랍니다.</p>
        <p className="text-sm text-muted-foreground">
          과금 및 라이브 종료가 안 될 시 서버에 큰 손해를 입기에 설정된 정책입니다.
        </p>
        <p className="text-sm text-muted-foreground">이 점을 참고해주시기 바랍니다.</p>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" className="h-12 text-base" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button className="h-12 text-base font-bold" onClick={onConfirm} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          확인하고 시작
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default StartLiveNoticeDialog;
