import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (vodOptions: { vodTitle?: string; vodCategory?: string; vodPreacher?: string }) => void;
  isPending: boolean;
}

const StopLiveDialog = ({ open, onOpenChange, onConfirm, isPending }: Props) => {
  const [vodTitle, setVodTitle] = useState('');
  const [vodCategory, setVodCategory] = useState('주일말씀');
  const [vodPreacher, setVodPreacher] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>라이브 종료 및 VOD 저장</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            라이브를 종료하면 녹화 영상이 자동으로 VOD로 저장됩니다.
          </p>
          <div className="space-y-2">
            <Label>VOD 제목</Label>
            <Input
              value={vodTitle}
              onChange={(e) => setVodTitle(e.target.value)}
              placeholder={`라이브 녹화 ${new Date().toLocaleDateString('ko-KR')}`}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>카테고리</Label>
            <Select value={vodCategory} onValueChange={setVodCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="주일말씀">주일말씀</SelectItem>
                <SelectItem value="수요말씀">수요말씀</SelectItem>
                <SelectItem value="특별집회">특별집회</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>설교자</Label>
            <Input
              value={vodPreacher}
              onChange={(e) => setVodPreacher(e.target.value)}
              placeholder="설교자 이름 (선택)"
              maxLength={100}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              onConfirm({
                vodTitle: vodTitle.trim() || undefined,
                vodCategory: vodCategory || undefined,
                vodPreacher: vodPreacher.trim() || undefined,
              })
            }
            disabled={isPending}
            className="gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            종료 및 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StopLiveDialog;
