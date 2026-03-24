import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, X, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const AdminPage = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [newChannel, setNewChannel] = useState({ name: '', description: '', stream_url: '', logo_url: '' });

  const { data: channels = [] } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: async () => {
      const { data } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: sermons = [] } = useQuery({
    queryKey: ['admin-sermons'],
    queryFn: async () => {
      const { data } = await supabase.from('sermons').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const createChannel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('channels').insert({
        name: newChannel.name,
        description: newChannel.description,
        stream_url: newChannel.stream_url,
        logo_url: newChannel.logo_url,
        is_approved: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('채널이 생성되었습니다');
      setNewChannel({ name: '', description: '', stream_url: '', logo_url: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleApproval = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      await supabase.from('channels').update({ is_approved: approved }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] }),
  });

  const toggleLive = useMutation({
    mutationFn: async ({ id, isLive }: { id: string; isLive: boolean }) => {
      await supabase.from('channels').update({ is_live: isLive }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('channels').delete().eq('id', id);
    },
    onSuccess: () => {
      toast.success('채널이 삭제되었습니다');
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const totalViews = sermons.reduce((sum, s) => sum + s.view_count, 0);
  const liveChannels = channels.filter(c => c.is_live).length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">관리자 페이지</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '총 채널', value: channels.length },
            { label: '라이브 중', value: liveChannels },
            { label: '총 말씀', value: sermons.length },
            { label: '총 조회수', value: totalViews.toLocaleString() },
          ].map(stat => (
            <Card key={stat.label} className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="channels">
          <TabsList>
            <TabsTrigger value="channels">채널 관리</TabsTrigger>
            <TabsTrigger value="new">새 채널</TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-3 mt-4">
            {channels.map(ch => (
              <Card key={ch.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{ch.name}</span>
                    {ch.is_approved ? (
                      <Badge variant="secondary" className="text-xs">승인됨</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">미승인</Badge>
                    )}
                    {ch.is_live && <Badge className="bg-live text-live-foreground text-xs">LIVE</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{ch.stream_url || '스트림 URL 없음'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleApproval.mutate({ id: ch.id, approved: !ch.is_approved })}
                    title={ch.is_approved ? '승인 취소' : '승인'}
                  >
                    {ch.is_approved ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant={ch.is_live ? 'destructive' : 'default'}
                    onClick={() => toggleLive.mutate({ id: ch.id, isLive: !ch.is_live })}
                  >
                    {ch.is_live ? '라이브 종료' : '라이브 시작'}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteChannel.mutate(ch.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
            {channels.length === 0 && (
              <p className="text-center text-muted-foreground py-8">등록된 채널이 없습니다.</p>
            )}
          </TabsContent>

          <TabsContent value="new" className="mt-4">
            <Card className="p-4 space-y-3">
              <Input placeholder="교회명" value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="설명" value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} />
              <Input placeholder="스트림 URL (HLS)" value={newChannel.stream_url} onChange={e => setNewChannel(p => ({ ...p, stream_url: e.target.value }))} />
              <Input placeholder="로고 URL" value={newChannel.logo_url} onChange={e => setNewChannel(p => ({ ...p, logo_url: e.target.value }))} />
              <Button onClick={() => createChannel.mutate()} disabled={!newChannel.name} className="w-full">
                <Plus className="w-4 h-4 mr-1" /> 채널 생성
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminPage;
