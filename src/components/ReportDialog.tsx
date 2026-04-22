import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const REASONS = [
  { value: 'heresy', label: '이단 교리' },
  { value: 'inappropriate', label: '부적절한 영상' },
  { value: 'copyright', label: '저작권 침해' },
  { value: 'other', label: '기타' },
];

interface ReportDialogProps {
  sermonId: string;
  sermonTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReportDialog = ({ sermonId, sermonTitle, open, onOpenChange }: ReportDialogProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reason, setReason] = useState('heresy');
  const [detail, setDetail] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('로그인이 필요합니다.');
      const trimmed = detail.trim().slice(0, 1000);
      const { error } = await supabase.from('sermon_reports').insert({
        sermon_id: sermonId,
        reporter_id: user.id,
        reason,
        detail: trimmed || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('신고가 접수되었습니다. 관리자 검토 후 답변드리겠습니다.');
      setDetail('');
      setReason('heresy');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || '신고 접수 중 오류가 발생했습니다.'),
  });

  const handleSubmit = () => {
    if (!user) {
      toast.info('신고는 로그인 후 가능합니다.');
      navigate('/login');
      return;
    }
    submit.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>영상 신고하기</DialogTitle>
          {sermonTitle && (
            <DialogDescription className="truncate">{sermonTitle}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">신고 사유</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {REASONS.map(r => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`r-${r.value}`} />
                  <Label htmlFor={`r-${r.value}`} className="font-normal cursor-pointer">{r.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="detail">상세 내용 (선택)</Label>
            <Textarea
              id="detail"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="문제가 되는 부분을 구체적으로 적어주세요."
              maxLength={1000}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">{detail.length}/1000</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submit.isPending}>
              {submit.isPending ? '접수 중...' : '신고 접수'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
