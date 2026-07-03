## 배경 확인

요청 사항 중 상당 부분이 **이미 구현되어 있어** 재작업 대신 조정으로 처리하는 것이 안전합니다. Broadcaster Critical Path 규정에 따라 승인 필요.

### 이미 있는 것
- **자동 종료 워치독** (`live-stream` edge function `autoStopIdleChannels` action, cron으로 주기 실행): RTMP idle / OBS 연결 끊김 / 장시간+저시청 keepalive 프롬프트 → grace 초과 시 자동 stop 이 모두 구현되어 있음.
- **관리자 강제 종료**: `stopChannel` action의 `reason` 파라미터 (admin 전용) 이미 존재. 백엔드가 GCP stop → DB `is_live=false`로 덮어씀.
- **시청자 실시간 집계**: `viewer_presence` 테이블 + Supabase Realtime Presence + `useViewerCount`/`useViewerHeartbeat` hooks가 이미 동작 중.
- **인코딩 720p**: 직전 요청으로 이미 720p / 1000kbps / 30fps로 하드코딩됨.

### 설계 충돌 (승인 전 결정 필요)
요청 2번은 "sermons 테이블에 컬럼 추가"인데, **sermons는 VOD (녹화 설교) 테이블**이고 실시간 방송 상태는 `channels` 테이블에서 관리됩니다. 라이브 시청 지표는 `channels`에, 세션 종료 후 스냅샷은 이미 있는 `live_sessions`에 저장하는 것이 데이터 모델상 맞습니다. **`sermons`가 아닌 `channels`(라이브 진행 중)와 `live_sessions`(종료 후 집계)에 저장**하는 방향으로 진행하겠습니다.

---

## 변경 계획

### 1. 인코딩 스펙 조정 (1500kbps, 24fps)
- `supabase/functions/live-stream/index.ts` `createChannel()`
  - `bitrateBps: 1000000 → 1500000`
  - `frameRate: 30 → 24`
  - 해상도 1280x720 유지, 단일 mux/manifest 유지
- 관리자 재프로비저닝 버튼으로 즉시 반영 (기존 로직 재사용).

### 2. 라이브 시청 지표 컬럼 & 저장 (channels + live_sessions)
- **마이그레이션** (`channels` 테이블):
  - `current_viewers int not null default 0` — 워치독이 1분 주기로 갱신
  - `peak_viewers int not null default 0` — max(current, peak)
  - `avg_watch_seconds int not null default 0` — 세션 종료 시 계산해 반영
- **`live_sessions`** (기존): 종료 시 `peak_viewers`, `avg_watch_seconds` 스냅샷 컬럼 추가 (없으면).
- **집계 소스**: 이미 존재하는 `viewer_presence`(최근 2분 heartbeat) + `live_viewer_samples`(분 단위 이력).
- **갱신 방식**:
  - `autoStopIdleChannels` 워치독(현재 2분 cron)이 이미 채널별로 viewer count를 조회하므로, 그 값을 그대로 `channels.current_viewers`/`peak_viewers`에 UPDATE 하는 코드를 추가.
  - 별도 잦은 cron 대신 기존 cron 파이프라인 확장 → 비용 절감.
- **프론트엔드 라벨**: 라이브 페이지의 카운터 라벨을 영문("Current Viewers · Peak · Avg Watch Time")으로 표시 (라이브 시청자에게 노출되는 곳만).

### 3. 3-Layer 좀비 스트림 방어 강화

#### Layer 1 — Frontend Auto-Kill (신규, 안전 가드 포함)
**주의**: OBS는 브라우저 독립적으로 GCP로 RTMP를 계속 밀 수 있기 때문에, 브라우저 닫힘만으로 즉시 GCP stop을 호출하면 실수로 방송이 끊길 수 있음. 아래처럼 완화:

- `BroadcasterControlPanel`이 라이브 중일 때만 `visibilitychange`/`pagehide` 이벤트에 `navigator.sendBeacon`으로 백엔드 `heartbeatBroadcaster` action 호출 → 마지막 브로드캐스터 heartbeat 시각을 `channels.broadcaster_last_seen_at`에 기록.
- 별도 신규 훅 `useBroadcasterPresence.ts` (보호 파일 우회, 새 파일).
- 워치독이 `broadcaster_last_seen_at` 이 3분 이상 없고 `stream_url` 도 없으면 자동 종료 (기존 disconnect 로직에 병합).
- **즉시 kill 은 하지 않음** — 명시적 종료 버튼일 때만 즉시 GCP stop. 이유는 리스크 리포트에 기재.

#### Layer 2 — Admin Force Stop (이미 있음, UI만 보완)
- 백엔드 흐름은 그대로 (`stopChannel` + `reason`, admin 전용).
- `AdminPage`에 "라이브 중" 채널 리스트에서 강제 종료 버튼 노출 (없으면 추가), 확인 다이얼로그.

#### Layer 3 — Watchdog Cron 규정 반영
현재 keepalive 프롬프트 기반 (5시간 이상 + 저시청 → 프롬프트 → grace). 요청 스펙에 맞춰 **정책 파라미터 값**을 조정 (스키마 아님):
- `low_viewer_threshold` 기본 2 → 그대로
- `auto_stop_max_minutes` 5시간 하드 캡: **5시간(300분) 초과 시 프롬프트 없이 즉시 종료** 로직 추가.
- 저시청 지속시간 트래킹 컬럼 추가:
  - `low_viewer_since timestamptz null` — 시청자 ≤ 2 상태 진입 시각. 워치독이 매번 계산.
  - 지속 시간 ≥ 50분이면 즉시 종료 (프롬프트 스킵).
- Cron 주기는 현재 2분 → **10분 스펙 반영을 위해 10분으로 변경**할지 검토. (2분이 반응성은 더 좋음. 사용자 요청은 "10분마다"이므로 10분으로 통일).

### 파일 변경 요약
- 마이그레이션 1개 (channels 컬럼 4개 추가, live_sessions 컬럼 2개 추가)
- `supabase/functions/live-stream/index.ts` — 인코딩 파라미터, 워치독 로직 확장, `heartbeatBroadcaster` action 추가
- 신규: `src/hooks/useBroadcasterPresence.ts`
- 수정: `BroadcasterControlPanel.tsx` (heartbeat 훅 mount), `AdminPage.tsx` (강제 종료 UI 보완), 라이브 페이지 지표 라벨 영문화
- `src/lib/liveStreamApi.ts` — `heartbeatBroadcaster` 래퍼 추가
- pg_cron 스케줄 주기 조정 (필요 시)

## 확인 요청

1. **컬럼 위치**: `sermons`가 아닌 `channels` + `live_sessions`에 저장 — OK?
2. **Frontend Auto-Kill 완화**: 브라우저 닫힘 시 즉시 GCP stop 대신 heartbeat 기반 지연 종료 — OK? (OBS 단독 송출 시 오작동 방지 목적)
3. **Cron 주기**: 현재 2분 → 요청대로 10분으로 변경 vs. 2분 유지 — 어느 쪽?
