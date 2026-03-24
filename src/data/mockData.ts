export interface Channel {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  subscriberCount: number;
  isLive: boolean;
}

export interface Sermon {
  id: string;
  channelId: string;
  title: string;
  preacher: string;
  category: '주일말씀' | '수요말씀' | '특별집회';
  thumbnailUrl: string;
  date: string;
  views: number;
  isLive: boolean;
  hlsUrl?: string;
  duration?: string;
}

export const channels: Channel[] = [
  { id: 'ch1', name: '사랑의교회', description: '서울 서초구 사랑의교회입니다. 매주 주일·수요 말씀을 전합니다.', logoUrl: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=100&h=100&fit=crop', subscriberCount: 12400, isLive: true },
  { id: 'ch2', name: '은혜교회', description: '부산 은혜교회. 복음의 은혜를 전하는 교회입니다.', logoUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=100&h=100&fit=crop', subscriberCount: 8200, isLive: false },
  { id: 'ch3', name: '소망교회', description: '경기도 소망교회. 말씀과 기도로 세워가는 교회입니다.', logoUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=100&h=100&fit=crop', subscriberCount: 5600, isLive: false },
  { id: 'ch4', name: '열린교회', description: '대전 열린교회. 세상을 향해 열린 교회입니다.', logoUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=100&h=100&fit=crop', subscriberCount: 3100, isLive: true },
];

export const sermons: Sermon[] = [
  { id: 's1', channelId: 'ch1', title: '믿음의 여정 - 아브라함의 순종', preacher: '김목사', category: '주일말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=640&h=360&fit=crop', date: '2026-03-22', views: 3420, isLive: true, hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 's2', channelId: 'ch4', title: '성령의 능력으로 사는 삶', preacher: '박목사', category: '주일말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=640&h=360&fit=crop', date: '2026-03-22', views: 1580, isLive: true },
  { id: 's3', channelId: 'ch1', title: '사랑의 계명 - 요한일서 강해', preacher: '김목사', category: '수요말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=640&h=360&fit=crop', date: '2026-03-19', views: 2100, isLive: false, duration: '45:30' },
  { id: 's4', channelId: 'ch2', title: '감사의 능력', preacher: '이목사', category: '주일말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=640&h=360&fit=crop', date: '2026-03-15', views: 4200, isLive: false, duration: '52:10' },
  { id: 's5', channelId: 'ch3', title: '부활의 소망', preacher: '최목사', category: '특별집회', thumbnailUrl: 'https://images.unsplash.com/photo-1510137600163-2729bc6959e4?w=640&h=360&fit=crop', date: '2026-03-10', views: 6800, isLive: false, duration: '1:05:22' },
  { id: 's6', channelId: 'ch2', title: '치유와 회복의 말씀', preacher: '이목사', category: '수요말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1473177104440-ffee2f376098?w=640&h=360&fit=crop', date: '2026-03-12', views: 1900, isLive: false, duration: '38:45' },
  { id: 's7', channelId: 'ch1', title: '십자가의 도 - 고린도전서', preacher: '김목사', category: '주일말씀', thumbnailUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=640&h=360&fit=crop', date: '2026-03-08', views: 5100, isLive: false, duration: '48:00' },
  { id: 's8', channelId: 'ch4', title: '은혜 안에서의 성장', preacher: '박목사', category: '특별집회', thumbnailUrl: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=640&h=360&fit=crop', date: '2026-03-05', views: 2300, isLive: false, duration: '55:15' },
];

export const getChannelById = (id: string) => channels.find(c => c.id === id);
export const getSermonsByChannel = (channelId: string) => sermons.filter(s => s.channelId === channelId);
export const getLiveSermons = () => sermons.filter(s => s.isLive);
export const getVodSermons = () => sermons.filter(s => !s.isLive);
