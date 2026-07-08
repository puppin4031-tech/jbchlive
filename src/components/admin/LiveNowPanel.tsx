import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Radio, Users, Stethoscope } from 'lucide-react';
import * as liveApi from '@/lib/liveStreamApi';
import { toast } from 'sonner';
import ChannelDiagnosticDialog from './ChannelDiagnosticDialog';

type LiveChannel = {
  id: string;
  name: string;
  live_started_at: string | null;
  gcp_channel_state: string | null;
};

const formatElapsed = (start: string | null) => {
  if (!start) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

// Subscribe to one channel's presence and report count up
const ViewerCountBadge = ({ channelId }: { channelId: string }) => {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const ch = supabase.channel(`viewers-${channelId}`, {
      config: { presence: { key: `admin-${Math.random()}` } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      // Subtract self (admin observer)
      const total = Object.values(state).reduce((sum, arr) => sum + (arr as unknown[]).length, 0);
      setCount(Math.max(0, total - 1));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId]);
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Users className="w-3 h-3" />
      {count ?? '…'}
    </Badge>
  );
};

const LiveNowPanel = () => {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<LiveChannel | null>(null);
  const [reason, setReason] = useState('');

  const { data: liveChannels = [] } = useQuery({
    queryKey: ['admin-live-channels'],
    queryFn: async () => {
      const { data } = await supabase
        .from('channels')
        .select('id, name, live_started_at, gcp_channel_state')
        .eq('is_live', true)
        .order('live_started_at', { ascending: true });
      return (data ?? []) as LiveChannel[];
    },
    refetchInterval: 15000,
  });

  const forceStop = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await liveApi.stopChannel(id, reason);
    },
    onSuccess: () => {
      toast.success('강제 종료되었습니다');
      setTarget(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-live-channels'] });
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="space-y-3">
        {liveChannels.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">현재 라이브 중인 채널이 없습니다.</p>
        ) : liveChannels.map(ch => (
          <Card key={ch.id} className="p-4 flex items-center gap-3 flex-wrap">
            <Badge className="bg-live text-live-foreground shrink-0 gap-1">
              <Radio className="w-3 h-3" /> LIVE
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{ch.name}</p>
              <p className="text-xs text-muted-foreground">
                경과 {formatElapsed(ch.live_started_at)} · {ch.gcp_channel_state || '상태 미상'}
              </p>
            </div>
            <ViewerCountBadge channelId={ch.id} />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setTarget(ch); setReason(''); }}
            >
              강제 종료
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>라이브 강제 종료</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{target?.name}</strong> 채널의 라이브를 강제로 종료합니다.
              송출자에게 사유가 알림으로 전달됩니다.
            </p>
            <Textarea
              placeholder="강제 종료 사유 (예: 무활동 / 부적절한 송출 등)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>취소</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || forceStop.isPending}
              onClick={() => target && forceStop.mutate({ id: target.id, reason: reason.trim() })}
            >
              {forceStop.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              강제 종료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LiveNowPanel;
