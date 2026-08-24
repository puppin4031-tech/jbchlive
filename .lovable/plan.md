# 클라우드 비용 급증 원인 제거: 크론 스마트 게이트 + 폴링 최적화

## 진단 결과 (데이터 확인 완료)

| 항목 | 현재 상태 | 비용 영향 |
|---|---|---|
| 크론 → 엣지 함수 호출 | 분당 5회 (30초 auto-stop + 1분 start/stop/sample) | 월 ~21만 회 호출, 방송 없는 날도 24시간 동작 |
| DB 절전 | 30초 간격 활동 때문에 불가 | Small 인스턴스 컴퓨팅 24시간 청구 |
| 엣지 함수 부팅 | 로그상 매분 4~5회 `booted` 확인 | 함수 실행 시간 과금 |
| 프론트 폴링 | 라이브 페이지 10초 간격 | 시청자 수만큼 호출 증가 |
| GCP 리소스 누수 | 없음 (두 채널 모두 STOPPED 확인) | - |

## 수정 계획

### 1. 크론 스마트 게이트 (핵심 — 비용의 대부분 제거)

**방식**: 4개의 무조건 실행 크론 → **1분짜리 크론 1개 + SQL 사전 검사**로 통합

- DB 함수 `public.live_tick_needed()` 생성 (마이그레이션):
  아래 조건 중 하나라도 해당할 때만 `true` 반환
  - `is_live = true` 인 채널 존재
  - `gcp_channel_state` IN ('STARTING','RUNNING','STOPPING','AWAITING_INPUT')
  - 2분 이내 `scheduled_start_at` 도래 예정인 채널 존재
  - keepalive 확인 대기 중인 채널 존재
- 크론 변경: `SELECT net.http_post(...) WHERE public.live_tick_needed();`
  - **방송 없는 날 = 엣지 함수 호출 0회** (월 21만 회 → 사실상 방송 시간만큼만)
  - 방송 중에도 분당 5회 → **1회**

### 2. 엣지 함수에 `tick` 통합 액션 추가

- `supabase/functions/live-stream/index.ts`에 `tick` 액션 추가
- 한 번의 호출 안에서 기존 4개 로직 순차 실행:
  `scheduledStartChannels` → `autoStopIdleChannels` → `scheduledStopChannels` → `sampleLiveViewers`
- 기존 개별 액션들은 그대로 유지 (하위 호환)
- 크론 시크릿 검증(`verify_cron_secret`) 로직 재사용

### 3. 안전장치 동작 보장 (중요)

- 180분 하드캡, RTMP 끊김 자동종료, 저시청자 자동종료, 예약 시작/종료 **모두 그대로 동작**
- 감지 주기가 30초 → 최대 1분으로 완화될 뿐, 종료 판정 로직은 변경 없음
- 게이트 조건에 STARTING/RUNNING/STOPPING 포함 → 방송 중에는 반드시 크론이 돎

### 4. 프론트엔드 폴링 완화

- `src/pages/LivePage.tsx`: `getPublicLiveStatus` 폴링 10초 → 30초, 탭이 백그라운드일 때 폴링 중지 (`refetchIntervalInBackground: false` — 기본값이지만 명시)
- `useViewerHeartbeat`: 60초 간격 유지하되 탭 숨김 시 전송 스킵 (시청 통계 정확도에도 이득 — 실제로 안 보는 시간 제외)

### 5. (선택) 인스턴스 다운사이즈 안내

- 현재 **Small** 인스턴스. 부하가 줄면 Cloud → Overview → Advanced settings에서 Micro로 낮추면 컴퓨팅 비용 추가 절감 가능
- 코드 변경 후 1~2주 사용량 보고 결정 권장 (이번 작업 범위에는 미포함)

## 기대 효과

```text
[Before] 크론 엣지 호출: ~7,200회/일 (24시간, 방송 무관)
         DB: 24시간 활성 (절전 불가)

[After]  크론 엣지 호출: 0회/일 (방송 없는 날)
                        ~180회 (3시간 방송 1회 기준)
         DB: 유휴 시 절전 가능 → 컴퓨팅 과금 시간 감소
```

## 기술 세부사항

- 마이그레이션: `live_tick_needed()` 함수 생성 + 기존 크론 4개(`live-auto-stop-idle`, `live-scheduled-start`, `live-scheduled-stop`, `live-sample-viewers`) 삭제 후 게이트된 `live-tick` 크론 1개 등록 (기존과 동일하게 `CRON_SECRET`을 vault에서 읽어 `x-cron-secret` 헤더로 전송)
- `gc-viewer-presence`(1분, 순수 SQL)와 `gc-live-viewer-samples`(하루 1회)는 비용 영향 미미하여 유지
- GCP Live Stream 비용은 별개(Google 청구) — 이번 작업은 Lovable Cloud 비용 절감 대상

## 검증

1. 마이그레이션 후 크론 목록에서 `live-tick` 1개만 active 확인
2. 방송 없는 상태에서 10분 대기 → 엣지 함수 로그에 `booted` 없음 확인
3. 테스트 방송 시작 → tick이 1분 내 감지하여 샘플링/자동종료 동작 확인
4. 180분 하드캡·RTMP 끊김 자동종료 로직 미변경 확인 (코드 diff)
