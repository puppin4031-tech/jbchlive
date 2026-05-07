import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBroadcasterChannel } from '@/hooks/useBroadcasterChannel';
import BroadcasterControlPanel from './BroadcasterControlPanel';
import { Button } from '@/components/ui/button';
import { Radio, ChevronDown, ChevronUp } from 'lucide-react';

const COLLAPSE_KEY = 'broadcaster-dock-collapsed';

const FloatingBroadcasterDock = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { channel, phase } = useBroadcasterChannel();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (!user || !channel || phase === 'no-channel' || phase === 'pending-approval') return null;

  // Hide on settings page (panel already shown there) and on own live viewing page
  const path = location.pathname;
  if (path === `/channel/${channel.id}/settings`) return null;
  if (path === `/live/${channel.id}`) return null;
  if (path === '/login') return null;

  const isLive = channel.is_live;

  return (
    <div className="fixed right-3 bottom-3 md:right-4 md:bottom-4 z-40 flex flex-col items-end gap-2">
      {!collapsed && <BroadcasterControlPanel variant="compact" />}
      <Button
        onClick={() => setCollapsed((c) => !c)}
        size="sm"
        variant={isLive ? 'destructive' : 'secondary'}
        className="shadow-lg h-10 gap-1"
        aria-label={collapsed ? '송출 패널 펼치기' : '송출 패널 접기'}
      >
        <Radio className={`w-4 h-4 ${isLive ? 'animate-pulse' : ''}`} />
        {collapsed ? (
          <>
            송출 {isLive ? '중' : '패널'} <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
    </div>
  );
};

export default FloatingBroadcasterDock;
