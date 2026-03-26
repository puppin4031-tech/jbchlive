

## 썸네일 자동 생성 계획

### 현재 상태
- 영상 등록 시 `thumbnail_url`을 수동으로 입력하는 방식
- YouTube, Google Drive, 직접 URL 지원 중

### 변경 방향
썸네일 URL 수동 입력을 제거하고, 영상 URL 기반으로 자동 썸네일을 추출/선택하는 UX로 전환

### 플랫폼별 썸네일 전략

| 소스 | 방법 |
|------|------|
| YouTube | `img.youtube.com/vi/{videoId}/0~3.jpg` — 4개 썸네일 자동 제공 |
| Google Drive | 미리보기 불가 → 기본 플레이스홀더 아이콘 표시 |
| 직접 URL (MP4 등) | `<video>` 로드 후 Canvas 캡처로 프리뷰 생성 (0초, 25%, 50%, 75% 지점) |

### 구현 단계

**1단계: 썸네일 추출 유틸리티 생성** (`src/lib/thumbnailUtils.ts`)
- `extractYouTubeThumbnails(url)` → YouTube ID 파싱 후 4개 썸네일 URL 배열 반환
- `captureVideoThumbnails(url)` → MP4를 숨긴 video 태그에 로드, 4개 시점에서 Canvas 캡처 → data URL 배열 반환
- Google Drive는 썸네일 추출 불가 → 기본 이미지 반환

**2단계: 썸네일 선택 컴포넌트** (`src/components/ThumbnailPicker.tsx`)
- 영상 URL 입력 시 자동으로 썸네일 후보 생성
- 4개 미리보기를 그리드로 표시, 클릭하여 선택
- 로딩 상태 및 실패 시 기본 플레이스홀더 표시

**3단계: ManageSermonsPage 수정**
- `thumbnail_url` 텍스트 입력 필드 제거
- `ThumbnailPicker` 컴포넌트로 교체
- YouTube: 선택한 썸네일 URL을 `thumbnail_url`에 저장
- 직접 URL: Canvas 캡처한 data URL을 저장 (또는 빈값으로 두고 프론트에서 동적 생성)

**4단계: SermonCard 썸네일 표시 업데이트**
- `thumbnail_url`이 없으면 `video_url`에서 YouTube 썸네일 자동 추출
- 그 외는 기본 플레이스홀더 표시

