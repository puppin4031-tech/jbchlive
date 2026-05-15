# 알림 확장 플랜 — 채널 & 라이브 양방향 피드백

현재 알림은 `support_tickets` 흐름(생성/답변/상태변경)에만 트리거가 걸려 있고, **채널 승인·정지·삭제, 라이브 시작·종료·오류**에는 알림이 전혀 없음. 이를 채워 넣되 **중복 알림 방지**가 핵심.

## 1. 설계 원칙 (중복 방지)

- **DB 트리거를 단일 소스로 사용** — 프론트와 Edge Function 양쪽에서 알림을 만들면 중복됨. 상태 변화는 모두 `channels` UPDATE 트리거 한 곳에서만 알림 생성.
- **`IS DISTINCT FROM`** 가드 — `NEW.is_approved IS DISTINCT FROM OLD.is_approved` 처럼 실제로 값이 바뀐 경우에만 INSERT.
- **Live 오류는 "전이"만 알림** — `gcp_last_error`가 NULL→값 또는 값이 바뀐 경우만, 동일 값 반복 업데이트는 무시.
- **자기 자신에게는 알림 보내지 않음** — 관리자가 자기 채널을 운영할 경우 owner==admin이면 1건만.
- **알림 타입(`type`) 표준화** — 같은 type+related_id 조합은 클라이언트 측에서 최신 1건만 강조하도록 Bell UI는 그대로 두고, DB는 INSERT 그대로 둔다(이력 보존). 단, 라이브 lifecycle은 트리거 가드로 1전이=1알림 보장.

## 2. 알림 이벤트 매트릭스

| 이벤트 | 트리거/위치 | 수신자 | type |
|---|---|---|---|
| 채널 개설 요청 (INSERT, is_approved=false) | `channels` AFTER INSERT | 모든 admin | `channel_request` |
| 채널 승인 (false→true) | `channels` AFTER UPDATE | 채널 owner | `channel_approved` |
| 채널 승인 취소 (true→false) | `channels` AFTER UPDATE | 채널 owner | `channel_unapproved` |
| 채널 정지 (is_suspended false→true) | `channels` AFTER UPDATE | 채널 owner (사유 포함) | `channel_suspended` |
| 정지 해제 (true→false) | `channels` AFTER UPDATE | 채널 owner | `channel_unsuspended` |
| 채널 삭제 | `channels` AFTER DELETE | 채널 owner + 모든 admin | `channel_deleted` |
| 라이브 시작 성공 | `channels` AFTER UPDATE (`is_live` false→true) | owner + 모든 admin | `live_started` |
| 라이브 정상 종료 | `channels` AFTER UPDATE (`is_live` true→false AND `gcp_last_error` IS NULL) | owner | `live_stopped` |
| 라이브 오류 발생 | `channels` AFTER UPDATE (`gcp_last_error`가 새 값으로 변경) | owner + 모든 admin | `live_error` |
| 정지 사유에 대한 이의신청 | 신규 UI → `support_tickets` INSERT (category='channel_appeal') | 기존 ticket 트리거가 admin에게 알림 | `ticket_new` (재사용) |
| 사이트 사용 문제 제기/피드백 | 기존 `/support` 활용, category 추가만 | 기존 트리거 재사용 | `ticket_new` |

## 3. 구현 단계

### 3.1 DB 마이그레이션 — 트리거 함수 3개 + 트리거 부착

**(a) `notify_channel_lifecycle()` — `channels` AFTER INSERT/UPDATE/DELETE**

- INSERT: `is_approved=false`면 모든 admin에게 `channel_request` 알림(link `/admin`).
- UPDATE 가드:
  - `is_approved` false→true: owner에게 `channel_approved`.
  - `is_approved` true→false: owner에게 `channel_unapproved`.
  - `is_suspended` false→true: owner에게 `channel_suspended` (body에 `suspended_reason`).
  - `is_suspended` true→false: owner에게 `channel_unsuspended`.
- DELETE: owner + admin 들에게 `channel_deleted`(link 없이, 채널명 body).
- 모든 INSERT는 `SECURITY DEFINER` 함수에서 수행(현재 notifications RLS는 INSERT 차단됨 → DEFINER로 우회).

**(b) `notify_live_lifecycle()` — `channels` AFTER UPDATE OF is_live, gcp_last_error**

- `is_live` false→true: owner+admin에게 `live_started` (link `/live/{id}`).
- `is_live` true→false AND (NEW.gcp_last_error IS NULL OR NEW.gcp_last_error = OLD.gcp_last_error): owner에게 `live_stopped`.
- `gcp_last_error` IS DISTINCT FROM OLD AND NEW IS NOT NULL: owner+admin에게 `live_error` (body=에러 메시지 80자 자르기).
- 같은 트랜잭션에서 두 컬럼이 동시 변할 수 있으므로 위 분기로 1알림만 발생.

**(c) RLS 보강** — `notifications`에 INSERT 정책은 추가하지 않음(트리거 함수가 DEFINER로 실행되므로 불필요). 단 시스템 안전을 위해 `WITH CHECK (false)` 명시 INSERT 정책은 두지 않음(현재처럼 정책 없음 = 일반 사용자 INSERT 불가, DEFINER만 가능).

### 3.2 Edge Function — 알림은 만들지 않음

`live-stream/index.ts`는 **`channels` 테이블만 업데이트**하면 위 트리거가 알아서 알림 생성. `start/stop/provision`에서 직접 `notifications.insert()` 호출하지 않음(중복 방지). 단, 시작·종료·에러 시 `gcp_last_error`/`is_live`를 정확히 업데이트하도록 기존 코드만 점검.

### 3.3 프론트 변경 (최소)

- **이의신청 진입점**: `ChannelPage`/`MyChannelPage`에서 `is_suspended`일 때 "정지 사유 이의신청" 버튼 → `/support/new?category=channel_appeal&subject=정지%20이의신청%20-%20{channel.name}` 프리필. 별도 백엔드 변경 없음(기존 ticket 트리거 재사용).
- **알림 link 라우팅**: `NotificationBell`은 이미 `n.link`로 navigate. 추가 라우트 없이 `/admin`, `/live/:id`, `/channel/:id`, `/support/:id` 모두 기존 라우트 사용.
- **AdminPage `deleteChannel`/`toggleApproval`/`toggleSuspend` 등 mutation은 변경 불필요** — 토스트만 유지, 알림은 트리거가 처리.

### 3.4 메모리 업데이트

`mem://features/live-notifications`에 "채널 라이프사이클·라이브 lifecycle 알림은 channels 트리거에서만 생성(중복 방지). Edge Function/프론트는 직접 INSERT 금지" 명시.

## 4. 중복·누락 방지 체크리스트

- [ ] 모든 UPDATE 분기는 `IS DISTINCT FROM` 사용 — 같은 값 재저장 시 알림 없음.
- [ ] `live_started`는 `is_live false→true` 1회만; `gcp_channel_state` 변화에는 미반응.
- [ ] `live_stopped`와 `live_error`는 상호배타(에러 동반 정지면 `live_error`만).
- [ ] owner=admin인 경우 `live_started`/`live_error` fan-out 시 중복 INSERT 방지(`WHERE user_id <> channel.owner_id` 또는 `ON CONFLICT DO NOTHING` + unique index 없이 단순 분리).
- [ ] DELETE 트리거는 OLD 행 사용; owner·admin 동일인이면 admin 루프에서 owner 제외.
- [ ] 알림 INSERT는 모두 SECURITY DEFINER 함수 내부에서 → RLS 우회 OK.

## 5. 검증

1. 신규 채널 생성 → admin 알림 1건만 도착.
2. admin 승인 → owner 알림 1건. 같은 값으로 재저장해도 알림 없음.
3. 정지 사유 입력 후 정지 → owner 알림(사유 포함). 해제 시 1건. 
4. owner가 "이의신청" 클릭 → `/support/new` 프리필 → 제출 → admin 알림(기존 trigger).
5. 라이브 시작 → owner+admin 각 1건. 정상 종료 → owner 1건. 강제 오류 시 `live_error`만 발생, `live_stopped` 미발생.
6. 같은 에러 메시지로 두 번 update → 알림 1건만.

## 영향 범위

- 라이브/VOD 재생, RTMP, 채널 카드, 검색 등 **기존 정상 동작에 영향 없음**.
- 알림 폭주 방지를 위해 트리거 가드가 핵심 — DB 마이그레이션 1회로 모든 게이팅 완료.
