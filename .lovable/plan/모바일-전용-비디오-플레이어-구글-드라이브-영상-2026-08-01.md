# 모바일 전용 비디오 플레이어 (구글 드라이브 영상)

## 현재 상태

`src/components/VideoPlayer.tsx` 는 구글 드라이브 영상을 모든 기기에서 동일하게 `drive.google.com/file/d/<id>/preview` iframe 으로 렌더링합니다. 컨테이너는 `aspect-[16/10] min-h-[350px] sm:min-h-[450px]`.

모바일 브라우저에서 Drive `/preview` iframe 은 자체 플레이어 UI가 축소되거나 재생이 시작되지 않는 경우가 많습니다(모바일 UA 처리 + 서드파티 쿠키 제한). 데스크탑에서는 정상.

## 해결 방향

기기별로 재생 경로를 나눕니다. 이미 있는 `useIsMobile()` 훅(768px 기준)을 사용합니다.

1. **모바일 = 네이티브 `<video>` 플레이어**
   - 소스: `https://drive.google.com/uc?export=download&id=<fileId>`
   - `controls playsInline` 로 렌더 → iOS/안드로이드 기본 플레이어 UI(재생/일시정지/타임라인/전체화면/AirPlay)를 그대로 사용
   - 썸네일이 있으면 `poster` 로 사용
   - 화면 비율은 `aspect-video` 로 통일 (네이티브 컨트롤은 영상 위에 오버레이되므로 여백 불필요)

2. **네이티브 재생 실패 시 자동 폴백**
   - `<video>` 의 `onError` 발생 시 기존 `/preview` iframe 으로 전환
   - iframe 도 안 될 경우를 대비해 "Drive 앱에서 열기" 버튼 노출

3. **데스크탑은 현행 유지**
   - 지금 잘 나오는 `/preview` iframe 그대로. 회귀 없음.

## 기술 세부 (변경 파일)

**`src/components/VideoPlayer.tsx`** 만 수정합니다.

- `parseVideoSource` 의 `google-drive` 분기에 `fileId`, `directUrl`(`uc?export=download&id=`) 필드 추가
- `useIsMobile()` import
- Drive 렌더 블록을 다음 구조로 분리:
  - `isMobile && !nativeFailed` → `<video src={directUrl} controls playsInline poster={poster} className="absolute inset-0 w-full h-full" onError={() => setNativeFailed(true)} />`
  - 그 외 → 기존 iframe
  - 공통 래퍼: `relative w-full aspect-video bg-black rounded-xl overflow-hidden`
  - 우상단 "새 창에서 열기" 링크는 유지
- `nativeFailed` 는 `src` 변경 시 리셋

## 검증

- 모바일 뷰포트(390px)에서 Drive VOD 재생 → 네이티브 컨트롤 노출 및 재생 확인
- 실제 모바일 브라우저(Chrome/Safari)에서 재생 확인
- 데스크탑에서 기존 iframe 회귀 없는지 확인
- YouTube / HLS 라이브 / 직접 mp4 경로는 변경 없음

## 범위 밖

- 백엔드/DB/Edge Function
- 업로드 시 Drive 공유 권한 검사 UX (별건 — 파일이 "링크가 있는 모든 사용자"가 아니면 어떤 방식으로도 재생 불가)
