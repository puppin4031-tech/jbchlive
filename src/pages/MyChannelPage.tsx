import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import SermonCard from '@/components/SermonCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Radio, Users, PlusCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const MyChannelPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: channel, isLoading: channelLoading } = useQuery({
    queryKey: ['my-channel', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('owner_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: sermons } = useQuery({
    queryKey: ['my-channel-sermons', channel?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('channel_id', channel!.id)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!channel?.id,
  });

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const isLoading = channelLoading;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">내 채널</h1>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : !channel ? (
          /* No channel yet */
          <Card className="p-8 text-center space-y-4">
            <div className="text-4xl">📡</div>
            <p className="text-foreground font-medium">아직 개설된 채널이 없습니다</p>
            <p className="text-sm text-muted-foreground">채널을 개설하고 라이브 방송을 시작해 보세요!</p>
            <Button onClick={() => navigate('/create-channel')}>
              <PlusCircle className="w-4 h-4 mr-1" /> 채널 개설하기
            </Button>
          </Card>
        ) : (
          <>
            {/* Channel Overview */}
            <Card className="p-5">
              <div className="flex items-center gap-4">
                {channel.logo_url ? (
                  <img src={channel.logo_url} alt={channel.name} className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Radio className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-lg text-foreground">{channel.name}</h2>
                    {channel.is_live && (
                      <span className="flex items-center gap-1 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-md">
                        <Radio className="w-3 h-3" /> LIVE
                      </span>
                    )}
                  </div>
                  {channel.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{channel.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Users className="w-3 h-3" /> 구독자 {channel.subscriber_count.toLocaleString()}명
                  </p>
                </div>
              </div>

              {/* Approval Status */}
              <div className="mt-4 flex items-center gap-2">
                {channel.is_approved ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 승인됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" /> 승인 대기 중
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2 flex-wrap">
                <Link to={`/channel/${channel.id}/settings`}>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-1" /> 채널 설정
                  </Button>
                </Link>
                <Link to={`/channel/${channel.id}`}>
                  <Button variant="ghost" size="sm">
                    채널 페이지 보기
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Quick Stats */}
            {channel.is_approved && (
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{sermons?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">최근 말씀</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{channel.subscriber_count}</p>
                  <p className="text-xs text-muted-foreground mt-1">구독자</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{channel.is_live ? '🔴' : '⚫'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{channel.is_live ? '방송 중' : '오프라인'}</p>
                </Card>
              </div>
            )}

            {/* Recent Sermons */}
            {channel.is_approved && sermons && sermons.length > 0 && (
              <section>
                <h3 className="font-semibold text-base mb-3 text-foreground">최근 말씀</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {sermons.map(s => (
                    <SermonCard key={s.id} sermon={{
                      id: s.id,
                      title: s.title,
                      preacher: s.preacher || '',
                      date: s.sermon_date,
                      thumbnailUrl: s.thumbnail_url || '/placeholder.svg',
                      duration: s.duration || '',
                      viewCount: s.view_count,
                      channelId: s.channel_id,
                      channelName: channel.name,
                      category: s.category as '주일말씀' | '수요말씀' | '특별집회',
                      isLive: s.is_live,
                    }} />
                  ))}
                </div>
              </section>
            )}

            {/* Not approved message */}
            {!channel.is_approved && (
              <Card className="p-6 text-center space-y-2 bg-muted/50">
                <div className="text-3xl">⏳</div>
                <p className="text-sm font-medium text-foreground">관리자 승인을 기다리고 있습니다</p>
                <p className="text-xs text-muted-foreground">승인이 완료되면 채널 관리 기능을 사용할 수 있습니다.</p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MyChannelPage;
