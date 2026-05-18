## 목표
채널 페이지에 **라이브 방송 히스토리 + 통계**를 표시. 채널 주인(및 관리자)은 상세 기록을, 일반 시청자는 요약 정보를 볼 수 있도록.

## 데이터 모델

### 신규 테이블: `live_sessions`
각 라이브 송출 1회 = 1행으로 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| channel_id | uuid | FK channels |
| started_at | timestamptz | 라이브 시작 |
| ended_at | timestamptz | 라이브 종료 (NULL = 진행 중) |
| duration_seconds | int | 종료 시 계산 |
| peak_viewers | int | 최고 동시 시청자 |
| avg_viewers | numeric(6,2) | 평균 동시 시청자 |
| total_unique_viewers | int | (선택) 누적 고유 접속자 |
| end_reason | text | manual / auto_idle / admin_forced / error / scheduled |
| title | text | 세션 제목 (선택) |
| thumbnail_url | text | (선택) |

### 신규 테이블: `live_viewer_samples`
1분마다 현재 시청자 수 스냅샷. 집계용.

| 컬럼 | 타입 |
|---|---|
| session_id | uuid FK |
| sampled_at | timestamptz |
| viewer_count | int |

세션 종료 시 이 테이블을 집계 → `peak_viewers`, `avg_viewers` 계산 후 raw 샘플은 30일 후 자동 삭제 (cron).

### RLS
- `live_sessions` SELECT: 누구나(공개) — 단, `total_unique_viewers` 같은 민감 수치는 view로 마스킹 가능
- `live_viewer_samples` SELECT: 채널 주인 + admin만 (상세 그래프용)
- INSERT/UPDATE: edge function의 service role만

## 기록 흐름

```text
[ 라이브 시작 ]
 useBroadcasterChannel → startChannel 성공 시
   └─ edge function이 live_sessions INSERT (started_at=now, channel_id)

[ 라이브 중 (1분마다) ]
 cron job (1분):
   for each channel where is_live=true:
     viewer_count ← Realtime Presence count (또는 신규 viewer_count 컬럼)
     INSERT live_viewer_samples(session_id, now(), count)
     UPDATE channels.current_viewer_count

[ 라이브 종료 ]
 stopChannel 성공 시 edge function이:
   - ended_at = now()
   - duration_seconds 계산
   - SELECT max/avg FROM live_viewer_samples → 세션 행 업데이트
   - end_reason 기록 (호출 컨텍스트에서 전달)
```

> **시청자 수 출처**: 현재 `useViewerCount`는 클라이언트 Presence 기반. 서버에서 정확히 집계하려면 채널별 viewer_count를 주기적으로 DB에 저장하는 경량 메커니즘 필요 → 클라이언트 heartbeat 또는 Presence 상태를 edge에서 폴링.
> 가장 간단: **클라이언트 viewer가 1분마다 `viewer-heartbeat` edge 호출** → 채널별 distinct user 카운트 → `live_viewer_samples` INSERT.

## 보호된 핵심경로 영향 분석 (`mem://constraints/broadcaster-critical-path`)

수정 필요한 보호 영역:
1. **`live-stream/index.ts`**: `startChannel`/`stopChannel` 액션 끝에 세션 INSERT/UPDATE 한 줄 추가 (기존 로직 변경 X, 신규 단계만 후행 추가)
2. **신규 액션 추가**: `viewer_heartbeat`, `aggregate_live_samples` (cron용) — 기존 액션과 분리됨

수정 불필요:
- `useBroadcasterChannel.ts`, `BroadcasterControlPanel.tsx`, `StartLiveDialog.tsx`, `StopLiveDialog.tsx`: 변경 없음
- 알림 트리거: 변경 없음

## UI

### 채널 페이지 (`/channel/:id`)
새 탭 또는 섹션 "**방송 기록**":
- 최근 라이브 카드 리스트 (날짜, 제목, 길이, 최고/평균 시청자)
- 채널 주인/관리자에게만: "상세" 버튼 → 시청자 추이 라인차트 (recharts, `live_viewer_samples` 기반)

### 내 채널 페이지 (`/my-channel`)
새 카드 "**채널 통계**":
- 총 방송 횟수 / 총 방송 시간
- 평균 시청자 / 최고 동시 시청자 (역대)
- 최근 30일 라이브 빈도 그래프
- 예정된 일정 (이미 있는 `scheduled_start_at` 활용)

### 신규 컴포넌트
- `ChannelLiveHistory.tsx` — 공개용 세션 리스트
- `ChannelLiveStats.tsx` — 채널 주인용 종합 통계 카드
- `LiveSessionDetailDialog.tsx` — 단일 세션 상세 + 시청자 추이 차트

## 비용/성능

- `live_viewer_samples`: 라이브 1시간당 60행 × 채널 수. 가벼움.
- raw 샘플은 30일 후 cron으로 삭제, 집계값은 `live_sessions`에 영구 보존.
- 시청자 heartbeat: 1분 주기, payload 최소. 기존 rate limit 정책 내.

## 작업 순서

1. DB 마이그레이션 (테이블 2개 + RLS + cron 1개)
2. edge function 확장 (start/stop 후행 + viewer_heartbeat + aggregate 액션)
3. 클라이언트 viewer heartbeat 훅
4. UI 컴포넌트 3종 + 채널/내채널 페이지 연결

## 확인 필요

1. **시청자 집계 방식**: 클라이언트 heartbeat(간단, 정확도 보통) vs Presence 기반 서버 폴링(복잡, 정확). → 1안 추천
2. **공개 범위**: `peak_viewers` 같은 수치를 일반 시청자에게도 보여줄까요, 아니면 채널 주인/관리자 전용?
3. **세션 제목**: 시작 시 입력받을지(StartLiveDialog 수정 필요 = 보호경로 변경) 또는 자동(예: "2026-05-18 라이브")으로 둘지?
