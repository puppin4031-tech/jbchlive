# Lovable Cloud 비용 절감 계획

## 문제 요약
- Lovable Cloud 사용량이 높아 Database server 비용이 전체의 83%를 차지함.
- 원인: Small 인스턴스가 24/7 가동 중이며, 과거에는 방송 여부와 관계없이 잦은 cron/edge 함수 호출이 지속적으로 DB를 깨움.

## 이미 적용된 조치
- **크론 통합**: 4개의 개별 cron job을 1개의 `live-tick` cron으로 통합.
- **게이트웨이 추가**: `live_tick_needed()` 함수로 방송 중/예정일 때만 edge 함수가 실행되도록 제한.
- **프론트엔드 폴링 절감**: 라이브 상태 폴링 10초 → 30s, 백그라운드 탭에서 시청자 하트비트 중단.

## 이번 계획: Database server 다운사이징
- **Small → Micro**로 인스턴스 크기를 낮춤.
- 이 작업은 프로젝트 설정 → Cloud → Database server에서 직접 변경해야 함.

## 예상 효과
- Database server 비용이 대폭 감소.
- 방송이 없는 날에는 크론 호출이 0에 가까워짐.

## 잠재적 리스크
- Micro는 CPU/메모리/최대 연결 수가 적어, 주일 예배 피크 시간에 동시 접속자가 급증하면 응답 지연이나 Realtime/Presence 불안정 가능.
- 데이터베이스 느림은 페이지 로딩, 라이브 상태 동기화, 댓글/알림 지연으로 이어질 수 있음.
- SEO나 외부 유입 자체를 차단하지는 않음.

## 권장 모니터링
- 다운사이징 후 첫 1~2주 동안 예배 시간의 응답 속도, Realtime 연결 수, 에러율을 확인.
- 피크 시간에 이상이 발생하면 즉시 Small로 복귀.

## 다음 단계
1. 사용자가 Cloud 설정에서 Database server를 Small → Micro로 변경.
2. 변경 후 `supabase--db_health`로 상태 확인.
3. 예배 시간 모니터링 및 필요 시 롤백.