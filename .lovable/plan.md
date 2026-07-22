
# 계획: 홈 히어로 제거 및 방송 유형 분기 (주일말씀=YouTube Live / 집회=GCP)

## 1. 홈(Index) 상단 히어로 배너 제거

- `src/pages/Index.tsx` 최상단에 렌더되는 큰 배너/캐러셀 영역만 제거
- 그 아래 카테고리 탭, 라이브 목록, 최신 말씀 등 기존 섹션은 그대로 유지
- 상단 여백만 자연스럽게 정리

## 2. 데이터 모델: broadcast_type

라이브 세션 단위로 유형 저장(사용자 선택안):

- 마이그레이션
  - `CREATE TYPE public.broadcast_type AS ENUM ('sunday_sermon', 'gathering');`
  - `live_sessions.broadcast_type broadcast_type NOT NULL DEFAULT 'gathering'`
  - `channels`에 YouTube 연동 필드 추가:
    - `youtube_connected boolean DEFAULT false`
    - `youtube_channel_id text`
    - `youtube_refresh_token text` (SECURITY DEFINER 함수 통해서만 읽기 — 클라이언트 노출 금지, RLS로 owner 조회 차단)
    - `youtube_last_broadcast_id text`, `youtube_last_video_id text`
  - `live_sessions`에 `youtube_video_id text`, `youtube_broadcast_id text`, `youtube_watch_url text` 추가
- 방송 시작 시 유형과 관련 ID를 세션 row에 기록. 채널 카드/방송 기록/라이브 목록에는 배지("주일말씀"/"집회") 표시

## 3. 방송 시작 UX

`BroadcasterControlPanel` 상단 "라이브 시작" 버튼 → 유형 선택 다이얼로그:

```text
[ 주일말씀 (YouTube Live) ]   [ 집회 (자체 스트리밍) ]
```

- 주일말씀 선택 시:
  1. `youtube_connected=false`면 "YouTube 계정 연결" 버튼 표시 → OAuth 시작
  2. 연결 완료 후 edge function `youtube-live` 호출로 broadcast+stream 생성
  3. 결과로 받은 RTMP URL/Stream Key를 `StartLiveDialog`(YouTube 버전)에 표시 → OBS 설정 안내
  4. OBS 송출 시작 감지되면 상태를 `live`로 transition
- 집회 선택 시: 지금과 동일한 GCP Live Stream 파이프라인(변경 없음)

## 4. YouTube Live Streaming API 자동 생성 (edge function)

새 edge function `supabase/functions/youtube-live/index.ts`:

- Actions:
  - `oauth_start` — Google OAuth URL 생성 (scopes: `https://www.googleapis.com/auth/youtube.force-ssl`, `youtube.readonly`, `userinfo.email`)
  - `oauth_callback` — code→refresh_token 교환, `channels.youtube_*` 저장
  - `create_broadcast` — refresh_token으로 access_token 갱신 → `liveBroadcasts.insert` + `liveStreams.insert` + `liveBroadcasts.bind` → RTMP URL/키 + watch URL 반환
  - `transition` — testing→live / live→complete
  - `get_status` — 브로드캐스트 lifeCycleStatus 조회
- Secrets 요청 필요:
  - `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` (사용자가 Google Cloud Console에서 발급, add_secret으로 저장)
  - Redirect URI: `<app_origin>/auth/youtube/callback`
- 클라이언트는 `youtube_refresh_token`을 절대 읽지 못함(RLS로 SELECT 차단, edge function service role만 접근)

## 5. 시청자용 재생

- `LivePage`에서 세션 `broadcast_type`이 `sunday_sermon`이면 `VideoPlayer` 대신 `YouTubeEmbed`(iframe `https://www.youtube.com/embed/<video_id>?autoplay=1`) 렌더
- 채팅/후원/시청자 카운트 등 기존 사이드 UI는 유지
- `broadcast_type`이 `gathering`이면 지금의 HLS 플레이어 그대로

## 6. 방송 종료

- 주일말씀: `youtube-live/transition` 호출로 `complete` 처리 후 세션 종료. VOD는 YouTube에 자동 저장(별도 처리 없음, 기존 방침대로 자동 VOD 미저장)
- 집회: 기존 GCP stop 로직 그대로

## 7. 표시/필터

- 채널 카드, 라이브 목록, 방송 기록: `broadcast_type` 배지
- 관리자 페이지 채널 상태 표에도 유형 컬럼 추가

## 기술 세부

- YouTube Data API v3 엔드포인트:
  - `POST /liveBroadcasts?part=snippet,status,contentDetails`
  - `POST /liveStreams?part=snippet,cdn,contentDetails`
  - `POST /liveBroadcasts/bind?part=id,contentDetails&id=<b>&streamId=<s>`
  - `POST /liveBroadcasts/transition?part=status&broadcastStatus=live&id=<b>`
- 토큰 갱신: `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`)
- 쿼터: 기본 10,000 units/일 — broadcast 생성 ~50 units, 여유 큼
- `youtube_refresh_token`는 RLS 정책에서 컬럼 단위 노출 방지를 위해 `channels` SELECT 정책은 유지하되, 뷰(`public.channels_public`) 또는 명시적으로 클라이언트 SELECT 컬럼 리스트에서 제외하는 방식으로 처리

## 사용자 필요 준비물

주일말씀 기능이 실제 동작하려면:

1. Google Cloud Console에서 OAuth Client ID(Web) 발급 → redirect URI 등록
2. `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` 두 Secret 저장 (구현 후 add_secret으로 요청)
3. 각 방송 채널 소유자가 최초 1회 자기 YouTube 계정 연결

## 산출물

- 마이그레이션 1건 (enum, 컬럼 추가, RLS 조정)
- 새 edge function `youtube-live`
- 신규 컴포넌트: `BroadcastTypeDialog`, `YouTubeConnectButton`, `YouTubeStartLiveDialog`, `YouTubeEmbed`
- 수정: `Index.tsx`(히어로 제거), `BroadcasterControlPanel`, `useBroadcasterChannel`, `LivePage`, `ChannelLiveHistory`, 카드 컴포넌트에 배지
