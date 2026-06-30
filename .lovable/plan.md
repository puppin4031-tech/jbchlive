# OBS 종료 → 라이브 채널 자동 종료 (1분 grace)

## 배경

OBS를 끄면 GCP는 즉시 `AWAITING_INPUT` 상태가 되지만, 현재는 **15분** 후에야 자동 종료됨. cron이 2분 주기라 실제론 더 늦어짐. (웹사이트 종료는 OBS→GCP 송출과 무관하므로 OBS 끊김 감지 하나로 두 시나리오 모두 커버됨.)

목표: OBS 끊김 후 약 1분 내 자동 종료 + 종료 1분 전 송출자 알림.

## 동작 흐름

```text
T+0s   OBS 종료 → GCP 상태: STREAMING → AWAITING_INPUT
T+30s  cron 첫 감지 → rtmp_disconnected_at = now() 기록
       → 송출자에게 알림: "OBS 연결 끊김. 1분 내 재연결되지 않으면 자동 종료됩니다"
T+90s  cron 재실행 → 끊김 60초 경과 + 여전히 AWAITING_INPUT → 자동 종료
       → 송출자에게 알림: "OBS 연결 끊김으로 자동 종료되었습니다"

OBS 재연결 시: 상태 STREAMING 복귀 → rtmp_disconnected_at = NULL → 알림 취소
```

## 구현

### 1. DB 마이그레이션 (channels 컬럼 2개 추가)

- `rtmp_disconnected_at timestamptz` — RTMP 끊김 최초 감지 시각 (재연결 시 NULL)
- `auto_stop_disconnect_minutes int DEFAULT 1` — 끊김 후 자동 종료까지 grace (기본 1분)

기존 `auto_stop_idle_minutes`(15분)는 폴백으로 유지 — RTMP가 한 번도 안 들어온 경우(OBS 시작 안 함) 대응.

### 2. cron 주기 단축

`pg_cron`에서 `live-stream/autoStopIdleChannels` 호출을 **2분 → 30초**로 변경 (1분 grace를 의미있게 만들기 위해).

### 3. Edge Function `autoStopIdleChannels` 로직 추가

기존 RTMP-idle (A), keepalive (B) 위에 **새 블록 (C) "RTMP 끊김 즉시 감지"** 추가:

각 `is_live=true` 채널마다 GCP 상태 조회 후:

| 현재 GCP 상태 | `rtmp_disconnected_at` | 동작 |
|---|---|---|
| `STREAMING` | NOT NULL | 재연결 — `rtmp_disconnected_at = NULL`, 알림 취소 |
| `AWAITING_INPUT` (RTMP 한 번이라도 연결됐던 채널: stream_url 존재) | NULL | 끊김 최초 감지 — `rtmp_disconnected_at = now()`, 송출자에게 `live_disconnect_warning` 알림 |
| `AWAITING_INPUT` (stream_url 존재) | NOT NULL & ≥ `auto_stop_disconnect_minutes` | 자동 종료 — `stopOne(reason="OBS 연결 끊김으로 자동 종료", endReason="auto_disconnect")` |

조건: `stream_url`이 채워진 적이 있는 채널만 — OBS 처음 켜기 전(`STARTING`/초기 `AWAITING_INPUT`)에는 적용 안 함.

### 4. 알림

- 새 type `live_disconnect_warning` (NotificationBell이 unknown type도 표시하므로 표시 로직 변경 불필요, 한국어 라벨만 추가)
- 종료 알림은 기존 `notify_live_lifecycle` 트리거가 `is_live false`로 자동 처리

### 5. 프론트엔드 (BroadcasterControlPanel)

`channel.rtmp_disconnected_at`이 NOT NULL이고 `is_live=true`일 때:
- 상단에 노란 경고 배너: "⚠ OBS 연결이 끊겼습니다. {남은초}초 내 재연결되지 않으면 자동 종료됩니다."
- Realtime 구독으로 이미 channels UPDATE 받고 있어 추가 작업 없음

## 보호 장치

- `auto_stop_disconnect_minutes`는 채널별 컬럼 — 향후 송출자가 조정 가능 (이번엔 UI 없이 기본 1분)
- 일시적 네트워크 끊김(<1분)이면 재연결되어 종료 안 됨
- 기존 `auto_stop_idle_minutes`(15분)와 keepalive(3시간) 로직 그대로 유지 — 다중 안전망

## 변경 파일

- `supabase/migrations/<new>.sql` — 컬럼 2개 추가
- `pg_cron` 스케줄 업데이트 (insert 도구로 별도 처리)
- `supabase/functions/live-stream/index.ts` — `autoStopIdleChannels`에 블록 (C) 추가
- `src/components/broadcaster/BroadcasterControlPanel.tsx` — 끊김 경고 배너
- `src/components/NotificationBell.tsx` — `live_disconnect_warning` 라벨 (필요 시)
