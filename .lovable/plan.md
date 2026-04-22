

## GCP Live Stream `fmp4` 분리 수정

### 문제
`createChannel` 호출 시 `mux-video-audio` 한 스트림에 video + audio가 합쳐져 있어 400 에러 발생. `fmp4` 컨테이너는 mux_stream당 elementary_stream 1개만 허용.

### 수정 파일
`supabase/functions/live-stream/index.ts` — `createChannel` 함수 내 `muxStreams` / `manifests` 블록

### 변경 내용

**Before:**
```ts
muxStreams: [{
  key: "mux-video-audio",
  container: "fmp4",
  elementaryStreams: ["video-stream", "audio-stream"],
  ...
}],
manifests: [{
  fileName: "main.m3u8",
  type: "HLS",
  muxStreams: ["mux-video-audio"],
  ...
}]
```

**After:**
```ts
muxStreams: [
  {
    key: "mux-video",
    container: "fmp4",
    elementaryStreams: ["video-stream"],
    segmentSettings: { segmentDuration: "6s" },
  },
  {
    key: "mux-audio",
    container: "fmp4",
    elementaryStreams: ["audio-stream"],
    segmentSettings: { segmentDuration: "6s" },
  },
],
manifests: [
  {
    fileName: "manifest.m3u8",
    type: "HLS",
    muxStreams: ["mux-video", "mux-audio"],
    maxSegmentCount: 5,
  },
],
```

### 추가 보강 (고아 리소스 방지)
`provisionChannel` 진입부에 best-effort cleanup 추가 — 이전 실패로 GCP에 남아있을 수 있는 동일 ID의 channel/input을 먼저 DELETE 시도(에러 무시) 후 새로 생성. 멱등성 확보.

### 사용자 다음 단계
1. 배포 완료 후 AdminPage → 채널 라디오 아이콘(재프로비저닝) 클릭
2. 성공 시 ChannelSettingsPage에서 RTMP URI 확인 → OBS 송출 테스트
3. HLS 재생 URL이 `manifest.m3u8`로 바뀌는 점 참고 (`getHLSUrl`에서 자동 처리되는지 확인 필요 — 현재 코드가 `main.m3u8` 하드코딩이면 함께 수정)

