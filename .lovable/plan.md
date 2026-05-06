## 라이브 송출 파이프라인 통합 수정 (전체 흐름 재정리)

### 전체 데이터 흐름 (현재 vs 정상)

```text
[송출자]                        [Edge Function]                     [DB]                      [시청자 UI]
1. "방송 시작" 클릭   →   startChannel                          
                          ├ GCP startChannelGCP                 
                          └ channels UPDATE                  is_live=true
                                                             gcp_channel_state=STARTING
                                                             stream_url=NULL  ← ❌ 여기가 비어있음
                                                                                      ↓
                                                                              Realtime → invalidate
                                                                              isLive=true && !streamUrl
                                                                              → "오프라인" 박스 (잘못된 표시)

2. OBS 송출 시작        →   GCP가 RTMP 수신                   
                          (사이트는 모름, 폴링 필요)            

3. ChannelSettingsPage  →   getStatus (5초 폴링)              gcp_channel_state=STREAMING
                          └ ❌ stream_url을 채우지 않음        stream_url=NULL  ← ❌ 영원히 비어있음

4. (라이브 종료)        →   stopChannel                       
                          └ getHLSUrl → gs://...   →   sermons.video_url=gs://  
                                                            ❌ validate_sermon_urls 트리거에서 거부
                                                            (실제 로그 확인됨: "video_url must be a valid HTTP/HTTPS URL")
```

### 핵심 결함 5가지

| # | 위치 | 결함 |
|---|---|---|
| 1 | `live-stream/index.ts startChannel` | GCP 시작만 하고 `stream_url`에 HLS 재생 URL을 저장하지 않음 |
| 2 | `live-stream/index.ts getHLSUrl` | `gs://{bucket}/...` 내부 URI 반환 — 브라우저 재생 불가, DB 트리거(`validate_stream_url`, `validate_sermon_urls`)도 거부 |
| 3 | `live-stream/index.ts getStatus` | DB의 `gcp_channel_state`만 sync. STREAMING 상태가 되어도 `stream_url`을 채워주지 않음 |
| 4 | `live-stream/index.ts stopChannel` | `stream_url` 클리어 안 함 + VOD 저장 시 `gs://` 그대로 insert → 트리거 거부 (이미 실패 로그 존재) |
| 5 | `LivePage.tsx` | `is_live=true && stream_url=NULL` 상태에 대한 UX 분기 없음 — 일반 오프라인과 구별 불가 |

### 수정 사항 (의존 순서대로)

#### 1. Edge Function: `supabase/functions/live-stream/index.ts`

**(a) 공용 헬퍼 추가**
```ts
function gsToHttps(uri: string): string {
  // gs://bucket/path → https://storage.googleapis.com/bucket/path
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return m ? `https://storage.googleapis.com/${m[1]}/${m[2]}` : uri;
}

async function buildHlsHttpsUrl(gcpChannelId: string): Promise<string | null> {
  const ch = await getChannelGCP(gcpChannelId);
  const fileName = ch.manifests?.[0]?.fileName ?? "manifest.m3u8";
  const outputUri = ch.output?.uri ?? "";
  if (!outputUri.startsWith("gs://")) return null;
  return gsToHttps(outputUri.replace(/\/?$/, "/") + fileName);
}
```

**(b) `startChannel` 액션**
- GCP `start` 호출 후 HLS HTTPS URL을 계산
- DB UPDATE에 `stream_url` 포함
```ts
const hlsUrl = await buildHlsHttpsUrl(gcpChannelId).catch(() => null);
await user.serviceClient.from("channels").update({
  is_live: true,
  live_started_at: new Date().toISOString(),
  gcp_channel_state: "STARTING",
  stream_url: hlsUrl,                    // ← 추가
}).eq("id", channelId);
```
> `output.uri`는 채널 생성 시점에 결정되므로 GCP가 STREAMING 상태가 아니어도 미리 알 수 있음. 시청자는 `is_live && stream_url`을 체크하므로 안전 (manifest 파일은 송출 시작 후 생성되며 hls.js가 자동 재시도).

**(c) `getStatus` 액션**
- 기존 sync 유지
- 응답에 `streamUrl` 포함 (디버깅/UI용)
- `stream_url`이 비어있고 manifest 계산 가능하면 같이 채움 (멱등 보정)

**(d) `stopChannel` 액션**
- `stream_url: null`로 클리어
- VOD 저장 전 `recordingUrl`을 `gsToHttps()` 변환
- 만약 변환 후에도 `https://`로 시작하지 않으면 `video_url: null`로 저장 (트리거 회피)

**(e) `autoStopIdleChannels` cron**
- 자동 종료 시에도 `stream_url: null` 같이 클리어

#### 2. `src/lib/liveStreamApi.ts`
- `getStatus` 반환 타입에 `streamUrl?: string | null` 추가

#### 3. `src/pages/LivePage.tsx`

상태 분기 3단계로 명확화:

```tsx
const isLive = channel.is_live;
const streamUrl = channel.stream_url;
const isWaitingForBroadcaster = isLive && !streamUrl;

if (isLive && streamUrl) {
  // 정상 재생
} else if (isWaitingForBroadcaster) {
  // "방송 준비 중 — 잠시만 기다려주세요" + 펄스 애니메이션
} else {
  // 오프라인
}
```

> Realtime 구독은 이미 있어서 `stream_url`이 채워지는 순간 자동 invalidate → 플레이어로 전환.

#### 4. `src/pages/ChannelSettingsPage.tsx`

기존 폴링 다이얼로그를 살짝 보강:

- 폴링 조건 변경: `startingDialogOpen || (channel?.is_live && !channel?.stream_url)`
  - 사용자가 다이얼로그를 닫아도 `stream_url`이 채워질 때까지 백그라운드 폴링 지속
- 다이얼로그 내 진행 단계 시각화:
  ```text
  ✓ GCP 채널 시작           STARTING → AWAITING_INPUT
  ⏳ OBS 송출 대기 중        AWAITING_INPUT
  ✓ 방송 송출 중             STREAMING + stream_url 존재 → "이제 시청자에게 보입니다"
  ```
- `gcp_last_error`가 있으면 빨간 알림 표시
- `getStatus` 응답에 `streamUrl`이 들어오면 즉시 channel 쿼리 invalidate

#### 5. DB 마이그레이션 — 불필요

`stream_url`은 이미 `https://`만 허용하는 트리거(`validate_stream_url`)가 걸려있고, 우리가 항상 `https://storage.googleapis.com/...`로 넣으므로 통과. NULL도 허용됨. 추가 변경 없음.

#### 6. (수동) GCS 버킷 공개 읽기 확인

`{GOOGLE_CLOUD_PROJECT_ID}-live-output` 버킷에 다음 IAM이 필요:
- 주체: `allUsers`
- 역할: `Storage Object Viewer (roles/storage.objectViewer)`

이게 없으면 HTTPS URL은 만들어져도 브라우저에서 403. **이건 GCP Console에서 1회 수동 작업**입니다. 이미 설정되어 있다면 무시. 작업 완료 후 시청 안 되면 이게 원인.

### 검증 시나리오

1. **방송 시작 → DB 즉시 확인**: `stream_url`이 `https://storage.googleapis.com/...-live-output/{uuid}/manifest.m3u8`로 채워짐
2. **OBS 미연결 상태**: LivePage에 "방송 준비 중" 표시 (오프라인과 다른 메시지)
3. **OBS 송출 시작 후**: ChannelSettings 진단 패널이 STREAMING으로 전환, LivePage가 자동으로 플레이어 표시 + HLS 재생
4. **방송 종료**: `stream_url=NULL`, VOD가 sermons에 정상 insert (이번엔 트리거 에러 없음)
5. **30분 무송출 자동 종료**: cron도 `stream_url` 클리어

### 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `supabase/functions/live-stream/index.ts` | gsToHttps 헬퍼, start/stop/getStatus/cron에서 stream_url 관리, VOD URL 변환 |
| `src/lib/liveStreamApi.ts` | getStatus 응답 타입 확장 |
| `src/pages/LivePage.tsx` | 3단계 상태 분기 (재생 / 송출 대기 / 오프라인) |
| `src/pages/ChannelSettingsPage.tsx` | 폴링 조건 확장 + 단계 시각화 강화 |
