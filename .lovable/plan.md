## 사전 영향도 분석 (Critical Path 점검)

본 작업은 `mem://constraints/broadcaster-critical-path`에 정의된 보호 영역을 건드립니다:
- `supabase/functions/live-stream/index.ts` — autoStopIdleChannels 로직 수정 필요 (버그 + 새 조건)
- `channels` 테이블 — 새 컬럼 추가 (`scheduled_start_at`, `scheduled_end_at`, `last_active_at`)
- `notify_channel_lifecycle()` — 변경 없음 (트리거가 이미 이력을 INSERT하므로 그대로 활용)

**리스크 및 대응**:
- 기존 start/stop mutation, phase 머신, parseRtmpUri는 **건드리지 않음**
- 새 컬럼은 모두 nullable + default → 기존 동작 무영향
- autoStop 로직 수정 시 정상 송출 중인 채널이 잘못 종료되는 것을 방지하기 위해, "viewer=0 AND last_active_at 경과" 양쪽 조건 충족 시에만 종료

---

## 진단 결과 (3번 — 자동 종료 안 되는 원인)

`cron.job` 확인 결과 **2개의 명확한 버그**:

1. **인증 실패**: cron이 호출하는 `x-cron-secret` 값이 `PLACEHOLDER_TO_BE_REPLACED` 문자열로 등록되어 있어 매 5분마다 호출은 가나 인증 거부됨. 로그에 흔적 없음.
2. **로직 결함** (`index.ts:478-498`):
   - `cutoff = live_started_at < 30분 전` → "송출 시작 30분 후"만 보고 활동 여부 무관
   - `if (state && state !== "STREAMING")` → 정상 STREAMING이면 절대 종료 안 함. 즉 "STREAMING이지만 아무도 안 보는" 케이스는 영원히 안 잡힘

---

## 작업 1: 채널 이력 타임라인 (관리자)

이미 `notifications` 테이블이 모든 라이프사이클(요청/승인/정지/삭제/이의신청/라이브 시작·종료·오류)을 기록 중. 별도 audit 테이블 만들지 않고 활용.

- `AdminPage.tsx`에 새 탭 "활동 이력" 추가
- 쿼리: `notifications`에서 `type IN (channel_*, live_*, ticket_*)` + `related_id`로 그룹핑
- UI: 시간순 타임라인 (날짜 헤더 + 채널명 + 액션 배지 + 사유)
- 필터: 채널별 / 액션 종류별 / 기간

## 작업 2: 관리자 강제 종료 (무활동 채널)

- `AdminPage.tsx` "라이브 현황" 섹션에 현재 라이브 채널 리스트
- 각 행에 viewer count (Presence 조회) + 송출 경과 시간 + **[강제 종료]** 버튼
- 버튼 → 확인 다이얼로그 (사유 입력) → `stopChannel` Edge Function 호출 + `gcp_last_error`에 "관리자 강제 종료: {사유}" 기록
- 관리자 권한은 Edge Function 내 `has_role` 체크 추가 (현재 owner_id만 체크)

## 작업 3: 자동 종료 버그 수정

**DB**:
- `channels.last_active_at TIMESTAMPTZ` 컬럼 추가
- Presence sync 시 채널별로 viewer가 있으면 last_active_at 업데이트 (Edge Function `heartbeat` 액션 신설, 또는 viewer 카운트 hook에서 1분마다 호출)

**Cron 재등록** (`supabase--insert`로):
- 기존 job unschedule 후 실제 service role key로 재등록
- 주기: 매 2분

**Edge Function `autoStopIdleChannels` 재작성**:
```ts
// 종료 조건: is_live=true AND
//   (last_active_at < now-15min OR last_active_at IS NULL AND live_started_at < now-15min)
//   AND GCP state in ('AWAITING_INPUT', 'STREAMING')
// → GCP stopChannel + DB update + (트리거가 알림 자동 발송)
```

## 작업 4: 시작/종료 예약

**DB 스키마**:
- `channels.scheduled_start_at TIMESTAMPTZ NULL`
- `channels.scheduled_end_at TIMESTAMPTZ NULL`

**UI** (`ChannelSettingsPage.tsx` 또는 `BroadcasterControlPanel.tsx`):
- "예약 송출" 카드 → datetime-local 2개 + 저장 버튼
- 예약 있으면 메인 패널에 "⏰ 14:30 시작 예정" 배지

**Cron 추가** (매 1분):
- `scheduledStartChannels`: `scheduled_start_at <= now AND is_live=false` → startChannel 실행 후 컬럼 NULL로 리셋
- `scheduledStopChannels`: `scheduled_end_at <= now AND is_live=true` → stopChannel 실행 후 NULL로 리셋

---

## 변경 파일 요약

```text
DB migration (스키마만):
  + channels.last_active_at, scheduled_start_at, scheduled_end_at

DB insert (cron 재등록):
  - 기존 auto-stop job 재등록 (실제 키)
  + scheduled-start job
  + scheduled-stop job

supabase/functions/live-stream/index.ts:
  - autoStopIdleChannels 로직 재작성
  + heartbeat 액션
  + scheduledStart/Stop 액션
  + 강제 종료 시 관리자 권한 허용

src/pages/AdminPage.tsx:
  + 활동 이력 탭
  + 라이브 현황 + 강제 종료 버튼

src/components/admin/ForceStopDialog.tsx (신규)
src/components/admin/ActivityTimeline.tsx (신규)
src/components/broadcaster/ScheduleCard.tsx (신규)

src/hooks/useViewerCount.ts:
  + heartbeat 호출 (1분 주기)
```

## 확인 사항

1. 자동 종료 **무활동 기준 시간**: 기본값 제안 = **15분** (현재 30분에서 단축). 변경 원하시면 알려주세요.
2. 관리자 강제 종료 시 송출자에게 알림 본문에 사유 노출 OK? (기본 OK로 진행 예정)
3. 예약 시간이 지난 후 시작 실패 시 동작: 1회 재시도 후 취소 + 알림 발송 (기본안)

위 3개는 기본값으로 진행해도 되면 바로 구현하고, 변경하실 부분 있으면 말씀해 주세요.