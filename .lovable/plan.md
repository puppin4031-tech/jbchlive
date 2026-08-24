# Lovable Cloud 비용 절감 계획

## 문제 요약
- Lovable Cloud 사용량 중 Database server가 전체의 83%를 차지함.
- 원인: Small 인스턴스가 24/7 가동 중이며, 과거에는 방송 여부와 관계없이 잦은 cron/edge 함수 호출이 지속적으로 DB를 깨움.

## 이미 적용된 조치 및 효과

### 1. 크론 통합 (4개 → 1개)
- **이전**: `auto-stop`, `scheduled-start`, `scheduled-stop`, `viewer-sample` 4개 cron이 각각 30초~1분마다 실행되어 하루 약 5,760회 edge function 호출.
- **이후**: `live-tick` cron 1개로 통합, 하루 약 1,440회로 감소.

### 2. 게이트웨이 (`live_tick_needed()`)
- **효과**: 방송 중이거나 예약된 방송이 2분 이내일 때만 실제 작업 수행.
- 방송이 없는 날에는 edge function이 즉시 종료되어 DB compute 사용량과 불필요한 로그가 대폭 감소.

### 3. 프론트엔드 폴링 절감
- 라이브 상태 확인 주기: 10초 → 30초.
- 백그라운드 탭에서는 시청자 하트비트 중단.
- 동시 접속자가 많을 때 DB 부하와 edge function 호출이 약 3분의 1 수준으로 감소.

## 이번 계획: Database server 크기 결정

### 옵션 A: Small 유지
- 예배 피크 시간에도 안정적인 성능 보장.
- 인스턴스 기본 유지비는 계속 발생하지만, 최적화로 인한 쿼리/호출 절감 효과는 그대로 적용됨.

### 옵션 B: Small → Micro 다운사이징
- Database server 비용을 대폭 절감.
- 주일 예배 피크 시간에 동시 접속자가 몰리면 응답 지연이나 Realtime 불안정 가능성 있음.
- 문제 발생 시 즉시 Small로 복귀 가능.

## 권장 사항
- 안정성 우선: **Small 유지** + 현재 최적화 상태 유지.
- 비용 절감 우선: **Micro로 변경** 후 첫 1~2주 예배 시간 모니터링.

## 다음 단계
1. 사용자가 Small 유지 또는 Micro 변경 여부를 결정.
2. Micro로 변경하는 경우, 프로젝트 설정 → Cloud → Database server에서 변경.
3. 변경 후 `supabase--db_health`로 상태 확인 및 예배 시간 모니터링.