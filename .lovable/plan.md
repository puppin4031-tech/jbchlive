# 모바일 커스텀 컨트롤바가 안 보이는 문제 해결

## 확인한 원인

모바일 뷰포트로 실제 VOD 페이지를 열어 DOM을 확인한 결과, 화면에 렌더된 것은 우리 `<video>` 가 아니라 **구글 드라이브 iframe**(`drive.google.com/file/.../preview`) 이었습니다. `<video>` 요소는 아예 존재하지 않았습니다.

즉 컨트롤바가 숨겨진 게 아니라, 다음 흐름 때문에 **커스텀 플레이어 자체가 렌더되지 않고 있습니다**:

1. 모바일에서는 먼저 네이티브 `<video>` 로 `drive.google.com/uc?export=download&id=...` 재생을 시도
2. 구글이 이 주소를 직접 재생용으로 내주지 않아 `onError` 발생
3. `driveNativeFailed` 가 true 가 되어 구글 드라이브 iframe 으로 폴백
4. iframe 은 외부 도메인이라 우리 UI(재생/음량/진행바)를 그 위에 올리거나 제어할 수 없음

따라서 hover / z-index / pointer-events 문제가 아니라 **재생 소스 문제**입니다. 이걸 먼저 고쳐야 커스텀 컨트롤이 의미를 갖습니다.

## 해결 방향

### 1) 드라이브 영상을 우리 서버 경유로 스트리밍 (핵심)

백엔드에 드라이브 스트리밍 프록시를 추가해, 브라우저가 우리 도메인의 URL로 `<video>` 재생을 하도록 만듭니다.

- 새 엣지 함수 `drive-proxy`: `fileId` 를 받아 구글 드라이브 파일 바이트를 그대로 중계
- **Range 요청 지원**(206 Partial Content) — 이게 있어야 모바일에서 탐색(seek)과 재생이 정상 동작
- 다운로드 확인 페이지(대용량 파일 바이러스 검사 인터스티셜) 응답을 감지해 실제 파일 스트림으로 재요청
- 응답 헤더에 `Content-Type`, `Accept-Ranges`, `Content-Length`, CORS 헤더 세팅
- 공개 권한이 아닌 파일(403/404)은 명확한 오류로 반환

플레이어는 이 프록시 URL을 `<video>` 소스로 사용하므로, 모바일·데스크탑 모두 우리 커스텀 컨트롤바가 그대로 뜹니다.

### 2) iframe 폴백은 최후 수단으로만

프록시까지 실패한 경우에만 드라이브 iframe 으로 넘어가고, 그때는 "구글 기본 플레이어로 재생 중"임을 작게 안내합니다. 데스크탑도 프록시 재생을 우선 사용해 모바일/데스크탑 UI를 통일합니다.

### 3) 커스텀 컨트롤 강제 적용 (요청하신 4가지)

`CustomVideoPlayer` 를 다음과 같이 보강합니다.

- `controls={false}` 명시, `playsInline`, `webkit-playsinline`, `x5-playsinline`(안드로이드 일부 브라우저) 속성 추가 — OS 기본 플레이어 탈취 방지
- 컨테이너 탭 시 컨트롤 **토글**(보이면 숨김 / 숨겨져 있으면 표시), 재생 중 3초 무동작 시 자동 숨김. hover 는 데스크탑 보조 수단으로만 사용
- 컨트롤 래퍼를 `absolute bottom-0 z-50` 로 올려 `<video>`(z-0)·탭 레이어(z-10) 위에 확실히 배치
- 탭 레이어에는 `pointer-events-auto`, 컨트롤바는 항상 클릭 가능하게 유지(숨김 상태에서만 `pointer-events-none`). 모든 버튼 최소 44x44px 터치 타깃 보장
- 진행바 thumb 도 모바일에서 잡기 쉽도록 키우고, 트랙 터치 영역을 44px 높이로 확보

## 기술 메모

- 추가: `supabase/functions/drive-proxy/index.ts` (Range 프록시, CORS, 인터스티셜 처리)
- 수정: `src/components/VideoPlayer.tsx` — `parseVideoSource` 의 google-drive 분기에 `proxyUrl` 추가, 모바일/데스크탑 모두 `CustomVideoPlayer` 우선, iframe 은 프록시 실패 시에만
- 수정: `src/components/CustomVideoPlayer.tsx` — 위 3)의 속성/토글/z-index/터치 타깃 반영
- `VideoControls.tsx` 는 현재 프로젝트에 없으며 컨트롤 UI는 `CustomVideoPlayer.tsx` 안에 있습니다
- 검증: 모바일 뷰포트(392x852)로 VOD 페이지를 열어 `<video>` 존재, 컨트롤바 표시, 탭 토글, 프록시 응답 코드(206)를 확인
