# 클라우드 비용 절감: DB 서버(83%) 다운사이즈 + 크론 스마트 게이트

## 진단 결과 (실제 데이터 확인 완료)

Usage 화면 기준 (최근 7일): **Database server 83%** / Network 12% / Compute 5% / 나머지 0%

| 항목 | 원인 | 근거 |
|---|---|---|
| DB 서버 83% | **Small 인스턴스 24시간 가동** (가동 시간 기준 과금) + 30초/1분 크론이 DB를 계속 깨워둠 | db_health: 메모리 40%, 접속 24/90, 디스크 12% → 부하 대비 과잉 스펙 |
| Network 12% | 라이브 HLS가 GCS 직접 접근 차단(412 조직 정책) 시 **백엔드 프록시 경유** + 드라이브 VOD 전체가 `drive-proxy` 통과 | `proxyHlsRequest`, `drive-proxy` 코드 확인 |
| Compute 5% | 크론 4개가 엣지 함수를 분당 5회 호출 (방송 없어도 월 ~21만 회) | 엣지 로그: 매분 4~5회 부팅 |

## 수정 계획 (효과 큰 순서)

### 1. DB 인스턴스 Small → Micro 다운사이즈 (83% 구간 정면 해결)

- 현재 부하(메모리 40%, 접속 24/90, 디스크 12%)로 보아 Micro로 충분
- `resize_compute` 도구로 진행 — 크기 선택 화면이 뜨면 **가장 작은 크기(Micro)** 선택
- 이 하나로 DB 서버 비용이 크게 줄어듦 (가동 시간 × 인스턴스 단가 구조)
- 주의: 교체 중 수 분간 DB 재시작. 적용 직후 방송 테스트 1회 권장

### 2. 크론 스마트 게이트 (Compute 5% → ~0%, DB 부하 절감)

4개의 무조건 실행 크론 → **1분 크론 1개 + SQL 사전 검사**로 통합:

- DB 함수 `public.live_tick_needed()` 생성 (마이그레이션):
  - `is_live = true` 이거나
  - `gcp_channel_state` IN ('STARTING','RUNNING','STOPPING','AWAITING_INPUT') 이거나
  - 2분 이내 예약 시작(`scheduled_start_at`)이 있는 경우에만 `true`
- 크론 변경: `SELECT net.http_post(...) WHERE public.live_tick_needed();`
  - **방송 없는 날 = 엣지 함수 호출 0회** (월 21만 회 → 방송 시간만큼만)
- 엣지 함수에 `tick` 통합 액션 추가: 1회 호출로 기존 4개 로직(예약시작/자동종료/예약종료/시청자샘플링) 순차 실행
- **안전장치는 그대로 유지**: 180분 하드캡, RTMP 끊김 자동종료, 저시청자 종료 전부 동작 (감지 주기만 최대 1분)

### 3. 프론트엔드 폴링 완화

- `src/pages/LivePage.tsx`: 라이브 상태 폴링 10초 → 30초
- `useViewerHeartbeat`: 탭이 백그라운드(숨김)일 때 하트비트 전송 스킵 — 실제 시청 중일 때만 집계되어 통계 정확도도 향상

### 4. Network 12% — 구조적 한계 안내 (이번 범위: 최소 개선만)

- 라이브 영상 프록시: GCP 조직 정책(Domain Restricted Sharing)이 GCS 버킷 공개를 막고 있어, 시청자 영상이 클라우드를 경유 중. 정책을 풀지 않는 한 완전 제거는 불가
- 단, 직접 접근이 가능한 경우에는 프록시로 폴백하지 않도록 `resolvePlayableManifest` 분기 점검 (직접 GCS URL 우선 확인)
- 드라이브 VOD 프록시(`drive-proxy`)는 모바일 재생 호환용이라 유지하되, 데스크탑에서는 iframe 직접 재생 유지(현재 구조 확인 후 불필요한 프록시 경유 제거)

## 기대 효과

```text
[Before] DB: Small 24시간 가동 + 분당 5회 크론 호출
         비용 구조: DB 83% / Network 12% / Compute 5%

[After]  DB: Micro 가동 (같은 시간이어도 단가 대폭 인하)
         크론: 방송 없는 날 0회 / 방송 중 분당 1회
         → Compute 거의 0, DB 부하 감소로 Micro 운영 안정
```

## 기술 세부사항

- 마이그레이션: `live_tick_needed()` 함수 생성 + 기존 크론 4개(`live-auto-stop-idle`, `live-scheduled-start`, `live-scheduled-stop`, `live-sample-viewers`) 삭제 후 게이트된 `live-tick` 크론 1개 등록 (기존과 동일하게 vault의 `CRON_SECRET` 사용)
- `gc-viewer-presence`, `gc-live-viewer-samples`(순수 SQL, 하루 1회)는 비용 영향 미미하여 유지
- 인스턴스 다운사이즈는 별도 승인 카드(크기 선택)로 진행
- GCP Live Stream 비용은 Google 별도 청구 — 이번 작업은 Lovable Cloud 비용 대상

## 검증

1. 다운사이즈 후 사이트 접속·로그인·영상 재생 정상 확인
2. 크론 목록에 `live-tick` 1개만 active 확인
3. 방송 없는 상태 10분 대기 → 엣지 함수 로그에 `booted` 없음 확인
4. 테스트 방송 시작 → tick이 1분 내 감지, 자동종료/샘플링 정상 동작 확인
