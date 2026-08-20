import Seo from '@/components/Seo';
import Header from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { PRICING_PLANS, PAYMENTS_ENABLED, formatKrw } from '@/lib/pricingPlans';

const PricingPage = () => {
  const handleSelect = (planName: string) => {
    if (!PAYMENTS_ENABLED) {
      toast.info(`${planName} 요금제 결제는 준비 중입니다. 문의하기로 신청해 주세요.`);
      return;
    }
    // TODO: create checkout session once the payment provider is connected.
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="요금제 안내"
        description="교회 라이브 스트리밍 요금제 안내. 채널 규모에 맞는 방송 플랜을 확인해 보세요."
        path="/pricing"
      />
      <Header />
      <main className="container px-4 py-8 max-w-5xl mx-auto space-y-8">
        <header className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">라이브 스트리밍 요금제</h1>
          <p className="text-sm text-muted-foreground">
            720p HD 기준 요금제입니다. VOD 다시보기와 1080p FHD 화질은 추후 제공될 예정입니다.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {PRICING_PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`p-5 flex flex-col gap-4 ${plan.highlighted ? 'border-primary border-2' : ''}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                  {plan.highlighted && <Badge>추천</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{plan.tagline}</p>
              </div>

              <p className="text-2xl font-bold text-foreground">{formatKrw(plan.monthlyPriceKrw)}</p>

              <ul className="text-sm text-foreground space-y-1.5">
                <li>추천 대상: {plan.recommendedFor}</li>
                <li>방송 횟수: 월 {plan.broadcastsPerMonth}회 (회당 {plan.hoursPerBroadcast}시간 권장)</li>
                <li>화질: {plan.quality}</li>
                <li>동시 시청자: {plan.concurrentViewers}</li>
              </ul>

              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
                {plan.comingSoon.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-auto w-full h-12"
                variant={plan.highlighted ? 'default' : 'outline'}
                onClick={() => handleSelect(plan.name)}
              >
                {PAYMENTS_ENABLED ? '결제하기' : '준비 중 (문의)'}
              </Button>
            </Card>
          ))}
        </section>

        <p className="text-xs text-muted-foreground text-center">
          표시 금액은 부가세 별도이며, 실제 사용량에 따라 변동될 수 있습니다. 결제 시스템은 오픈 예정입니다.
        </p>
      </main>
    </div>
  );
};

export default PricingPage;
