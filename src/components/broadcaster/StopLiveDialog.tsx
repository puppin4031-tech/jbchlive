import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

const StopLiveDialog = ({ open, onOpenChange, onConfirm, isPending }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>라이브를 종료하시겠습니까?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">
            송출이 즉시 중단되며 시청자 화면에서 라이브가 사라집니다.
          </p>
          <p className="text-xs text-muted-foreground">
            ※ 다시보기(VOD)는 자동 저장되지 않습니다. 필요한 경우 외부 영상(YouTube 등)으로 별도 등록해 주세요.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            라이브 종료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StopLiveDialog;
