/**
 * Live streaming pricing plans (preparation only).
 * Billing integration is NOT enabled yet — these values drive the public
 * pricing page and will later be mapped to payment provider price IDs.
 */

export type PlanId = 'basic' | 'standard' | 'premium';

export interface PricingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPriceKrw: number;
  recommendedFor: string;
  broadcastsPerMonth: number;
  hoursPerBroadcast: number;
  quality: string;
  concurrentViewers: string;
  features: string[];
  comingSoon: string[];
  highlighted?: boolean;
  /** Filled in when the payment provider is connected. */
  providerPriceId?: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: '소규모 라이브를 위한 기본 플랜',
    monthlyPriceKrw: 80000,
    recommendedFor: '소규모 정기 소통 / 수업',
    broadcastsPerMonth: 9,
    hoursPerBroadcast: 2,
    quality: '720p HD',
    concurrentViewers: '월 평균 20명',
    features: ['실시간 HD 스트리밍', '실시간 라이브 채팅'],
    comingSoon: [],
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: '더 많은 방송과 참여자를 위한 선택',
    monthlyPriceKrw: 150000,
    recommendedFor: '일반 행사 및 정기 강의',
    broadcastsPerMonth: 15,
    hoursPerBroadcast: 2,
    quality: '720p HD',
    concurrentViewers: '월 평균 50명',
    features: ['Basic 기능 전체 포함', '방송 횟수 및 인원 확장', '기술 지원'],
    comingSoon: ['VOD 다시보기 (출시 예정)', '1080p FHD 화질 (출시 예정)'],
    highlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: '대규모 인원 수용 및 활발한 방송 운영',
    monthlyPriceKrw: 300000,
    recommendedFor: '대규모 이벤트 / 주요 행사',
    broadcastsPerMonth: 30,
    hoursPerBroadcast: 2,
    quality: '720p HD',
    concurrentViewers: '월 평균 100명 이상',
    features: ['Standard 기능 전체 포함', '트래픽 분산 최적화', '전담 우선 기술 지원'],
    comingSoon: ['VOD 다시보기 (우선 지원 예정)', '1080p FHD 화질 (우선 지원 예정)'],
  },
];

/** Toggle to true once the payment provider is connected. */
export const PAYMENTS_ENABLED = false;

export const formatKrw = (value: number) => `월 ${value.toLocaleString('ko-KR')}원`;
