import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  channelId: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
};

// Convert ISO → 'YYYY-MM-DDTHH:mm' in local TZ for datetime-local input
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ScheduleCard = ({ channelId, scheduledStartAt, scheduledEndAt }: Props) => {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(toLocalInput(scheduledStartAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEndAt));

  useEffect(() => {
    setStart(toLocalInput(scheduledStartAt));
    setEnd(toLocalInput(scheduledEndAt));
  }, [scheduledStartAt, scheduledEndAt]);

  const save = useMutation({
    mutationFn: async () => {
      const startIso = start ? new Date(start).toISOString() : null;
      const endIso = end ? new Date(end).toISOString() : null;
      if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
        throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다');
      }
      const { error } = await supabase
        .from('channels')
        .update({ scheduled_start_at: startIso, scheduled_end_at: endIso })
        .eq('id', channelId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('예약이 저장되었습니다');
      queryClient.invalidateQueries({ queryKey: ['my-channel'] });
      queryClient.invalidateQueries({ queryKey: ['channel-settings', channelId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('channels')
        .update({ scheduled_start_at: null, scheduled_end_at: null })
        .eq('id', channelId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('예약이 취소되었습니다');
      setStart('');
      setEnd('');
      queryClient.invalidateQueries({ queryKey: ['my-channel'] });
      queryClient.invalidateQueries({ queryKey: ['channel-settings', channelId] });
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">예약 송출</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        지정한 시각에 자동으로 라이브가 시작/종료됩니다. (매 분 단위 점검)
      </p>
      <div className="space-y-2">
        <Label htmlFor="sched-start" className="text-sm">시작 예약</Label>
        <Input
          id="sched-start"
          type="datetime-local"
          value={start}
          onChange={e => setStart(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sched-end" className="text-sm">종료 예약</Label>
        <Input
          id="sched-end"
          type="datetime-local"
          value={end}
          onChange={e => setEnd(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          저장
        </Button>
        {(scheduledStartAt || scheduledEndAt) && (
          <Button variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending}>
            예약 취소
          </Button>
        )}
      </div>
    </Card>
  );
};

export default ScheduleCard;
