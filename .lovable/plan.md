

## 복구 계획: VideoPlayer를 KakaoTV/AfreecaTV 추가 이전 상태로

### 변경 파일
`src/components/VideoPlayer.tsx` 1개

### 복구 내용
- `VideoSource` 타입에서 `kakao`, `afreeca` 제거
- `parseVideoSource`에서 카카오TV(cliplink, 단축 URL), 아프리카TV 파싱 로직 제거
- `IFRAME_TYPES` 상수 제거하고 렌더링부에서 `youtube`/`google-drive`만 iframe으로 처리하던 원래 구조로 복원
- YouTube, Google Drive, GoFile(external-only), 직접 링크(HLS/MP4) 지원은 그대로 유지

### 복구 후 지원 목록
- YouTube
- Google Drive (`/file/d/ID/`)
- GoFile (외부 링크 버튼)
- 직접 링크 (HLS `.m3u8`, MP4 등)

### 주의
복구 후엔 카카오TV / 아프리카TV 링크를 넣으면 검은 화면(direct로 처리됨)이 됩니다. 사용자가 명시적으로 "이전 상태로 되돌려달라"고 요청했으므로 의도된 동작입니다.

