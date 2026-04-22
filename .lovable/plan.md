

## OBS 라이브 스트리밍 - 완전 작동 플랜 (보완 반영)

제이나이의 4가지 보완점을 모두 반영한 최종 플랜입니다.

---

### 🎯 핵심 흐름 (수정 후)

```text
[관리자 승인]
    ↓
[provisionChannel] ──► createInput → createChannel → DB 저장
    ↓                  (실패 시 Clean-up: 만든 Input 자동 삭제)
[채널 설정 페이지]
    ↓                  GCP가 발급한 RTMP URI 표시 (호스트/키 분리)
[방송 시작 버튼]
    ↓
[startChannel] ──► STARTING 상태
    ↓
[상태 폴링 UI] ──► 5초마다 getStatus → "준비 중 (1~2분)" 표시
    ↓
[RUNNING 확인] ──► "OBS에서 방송 시작하세요" 안내
    ↓
[OBS 송출]
    ↓
[방송 종료 버튼] ──► stopChannel (필수, 과금 방어)
    ↓
[자동 안전장치] ──► Cron: 30분간 입력 없으면 강제 stop
```

---

### 1단계: DB 스키마

```sql
ALTER TABLE channels
  ADD COLUMN gcp_input_uri text,           -- RTMP 전체 URI
  ADD COLUMN gcp_channel_state text,       -- STARTING/RUNNING/STOPPED 등
  ADD COLUMN gcp_provisioned_at timestamptz,
  ADD COLUMN gcp_last_error text,          -- 실패 메시지 영구 기록
  ADD COLUMN live_started_at timestamptz;  -- 자동 종료 판단용
```

---

### 2단계: 엣지 함수 보강 (`live-stream/index.ts`)

#### 신규/수정 액션

| 액션 | 동작 | 안전장치 |
|---|---|---|
| `provisionChannel` | createInput → createChannel → DB 업데이트 | **Clean-up**: createChannel 실패 시 createInput 결과물 삭제 / 에러를 `gcp_last_error`에 저장 |
| `startChannel` (수정) | GCP START 호출 + `live_started_at` 기록 | 실패 시 명확한 에러 반환 |
| `stopChannel` (수정) | GCP STOP 호출 + DB 라이브 상태 false | 멱등성 (이미 중지면 OK) |
| `getStatus` (수정) | GCP 채널 상태 반환 → DB `gcp_channel_state` 동기화 | 폴링용 |
| `autoStopIdleChannels` (신규) | Cron 호출용. `live_started_at` 후 30분 + 무송출 채널 STOP | 비용 방어 핵심 |
| `validateOutputBucket` (provision 내부) | GCS `puppinai-live-output` 존재 + 쓰기 권한 사전 체크 | 실패 시 provision 중단 |

#### Clean-up 로직 예시 (보완 4번)
```typescript
let inputId = null;
try {
  inputId = await createInput(channelId);
  await createChannel(channelId, inputId);
  await updateDB({ gcp_input_uri, gcp_provisioned_at });
} catch (err) {
  if (inputId) await deleteInput(inputId).catch(e => log("cleanup failed", e));
  await updateDB({ gcp_last_error: err.message });
  throw err;
}
```

---

### 3단계: 자동 종료 Cron (보완 1번 - 비용 방어)

`pg_cron` + `pg_net`으로 **5분마다** `autoStopIdleChannels` 호출:
- `is_live = true` AND `live_started_at < now() - interval '30 minutes'` AND GCP 상태가 입력 없음
- 자동으로 stopChannel 실행 → 알림 로그 기록

(SQL은 사용자별 URL/키 포함이라 insert 도구로 별도 실행)

---

### 4단계: 관리자 페이지 (`AdminPage.tsx`)

- **승인 버튼**: `is_approved = true` + 자동으로 `provisionChannel` 호출
- **GCP 재프로비저닝 버튼**: 기존 채널(`jbch 파주교회`) 복구용
- **에러 표시**: `gcp_last_error` 있으면 빨간 배지로 표시 → 클릭 시 상세

---

### 5단계: 채널 설정 페이지 (`ChannelSettingsPage.tsx`)

#### RTMP 정보 표시 (동적)
- `channel.gcp_input_uri` 파싱:
  - **서버**: `rtmp://HOST:1935/live`
  - **스트림 키**: URI 마지막 path 세그먼트
- 미프로비저닝 시: "관리자 승인 후 자동 발급됩니다" 안내

#### 방송 시작 플로우 (보완 2번 - 상태 대기 UX)
```
[방송 시작] 버튼 클릭
   ↓
1. startChannel 호출
2. 모달 표시: "🟡 GCP 서버 준비 중... (보통 1~2분)"
3. 5초마다 getStatus 폴링 → 진행률 표시
4. RUNNING 감지 시:
   "🟢 준비 완료! 이제 OBS에서 [방송 시작]을 누르세요"
   + RTMP 정보 다시 강조
5. [방송 종료] 버튼 활성화
```

#### 방송 종료 (보완 1번)
- 명확한 빨간색 [방송 종료] 버튼 상시 노출
- 클릭 시 확인 다이얼로그 → stopChannel + 자동 VOD 저장 옵션

---

### 6단계: 사용자 안내 강화

- 채널 설정 페이지 상단 안내문:
  > ⚠️ **방송 종료 시 반드시 [방송 종료] 버튼을 눌러주세요.**
  > 누르지 않으면 GCP 서버 비용이 계속 청구됩니다.
  > (30분간 미송출 시 자동 종료되지만, 수동 종료 권장)

---

### 📋 변경 파일 정리

| 파일 | 작업 |
|---|---|
| `supabase/migrations/*` | 신규 — channels 컬럼 5개 추가 |
| `supabase/functions/live-stream/index.ts` | 보강 — provision/autoStop 추가, Clean-up |
| `src/lib/liveStreamApi.ts` | 신규 액션 래퍼 추가 |
| `src/pages/AdminPage.tsx` | 승인 자동 프로비저닝 + 에러 표시 |
| `src/pages/ChannelSettingsPage.tsx` | RTMP 동적 파싱 + 상태 폴링 모달 + 종료 버튼 |
| `src/integrations/supabase/types.ts` | 자동 갱신 |
| Cron 스케줄 (insert 도구) | 5분마다 autoStopIdleChannels |

---

### 🤝 제이나이 협업 권장 영역

| 작업 | 이유 |
|---|---|
| GCP `puppinai` 프로젝트 서비스 계정에 `roles/livestream.editor` + `roles/storage.objectAdmin` 부여 확인 | Console 접근 필요 |
| `puppinai-live-output` GCS 버킷 존재 + `asia-northeast1` 리전 일치 확인 | 인프라 점검 |
| 1차 프로비저닝 후 `ffmpeg`로 RTMP URI에 직접 푸시 테스트 | OBS 외 변수 제거한 검증 |
| `asia-northeast1` Live Stream API 동시 채널 할당량 확인 | 운영 안정성 |

---

### 🚀 진행 순서
1. 마이그레이션 + 엣지 함수 보강 (provision + autoStop + Clean-up)
2. liveStreamApi 래퍼 + AdminPage 자동 프로비저닝
3. ChannelSettingsPage RTMP 표시/시작/폴링/종료 UI
4. Cron 스케줄 등록
5. 기존 `jbch 파주교회` 재프로비저닝 → OBS 재시도

승인하시면 위 순서로 한 번에 구현합니다.

