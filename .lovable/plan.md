# 썸네일 직접 업로드 기능 추가

## 목표
`/sermons` (영상 관리) 페이지의 영상 등록/수정 폼에서, 기존 자동 썸네일 추출 기능(YouTube/Drive/Direct)을 **그대로 유지**한 채, 사용자가 자신의 이미지를 직접 업로드할 수 있는 옵션을 추가합니다. 업로드 시 자동 압축하여 용량 문제로 인한 오류를 방지합니다.

## 변경 범위 (최소 침습)
- **수정 파일:** `src/components/ThumbnailPicker.tsx` 1개만 수정
- **신규 파일:** `src/lib/imageCompress.ts` (압축 유틸)
- **수정 안 함:** `ManageSermonsPage.tsx`, DB 스키마, RLS, 기존 자동 추출 로직 (`thumbnailUtils.ts`)

## 구현 내용

### 1. 압축 유틸 (`src/lib/imageCompress.ts`)
- File을 받아 Canvas로 리사이즈 + JPEG 인코딩
- 기본: 최대 가로 1280px, quality 0.82
- 결과가 여전히 크면 quality를 단계적으로 낮춰 재시도 (0.7 → 0.6 → 0.5)
- 최종 목표: ≤ 500KB (일반적으로 한 번에 통과)
- 반환: 압축된 `Blob` (image/jpeg)

### 2. ThumbnailPicker 확장
- 기존 자동 썸네일 그리드는 그대로 유지
- 상단에 **"내 이미지 업로드"** 버튼 추가 (`<input type="file" accept="image/*">`)
- 업로드 흐름:
  1. 파일 선택 → 이미지 타입/크기 검증 (원본 ≤ 10MB 제한, 그 이상은 거부)
  2. `compressImage()` 호출 → JPEG Blob 생성
  3. `supabase.storage.from('sermon-thumbnails').upload('{user.id}/{uuid}.jpg', blob)`
  4. `getPublicUrl` → `onChange(url)` 호출
  5. 업로드된 썸네일도 그리드에 함께 표시되어 선택 상태 유지
- 진행 상태(`uploading`) UI 및 에러 토스트 처리
- 인증된 사용자만 업로드 가능 (`useAuth`로 user.id 조회)

### 3. 에러 처리
- 비이미지 파일 → 토스트 안내
- 압축 실패 / 업로드 실패 → 사용자 친화적 메시지
- `try-catch` + 명시적 로딩 상태

## 기존 기능 보호
- `thumbnailUtils.ts` 변경 없음
- `ManageSermonsPage`의 `upsertMutation`, validate, form 상태 변경 없음 — `thumbnail_url`은 동일하게 string으로 저장
- 자동 추출(YouTube/Drive/Direct) 동작 그대로
- 기존 storage 버킷(`sermon-thumbnails`)과 RLS 정책 그대로 사용 (이미 `{user_id}/...` 경로 규칙 충족)

## 기술 메모
- 압축은 순수 클라이언트(Canvas API) — 외부 라이브러리 의존성 없음
- Edge function 사용 안 함 → base64 prefix/CORS 이슈 회피
- 업로드된 파일명은 `crypto.randomUUID()`로 충돌 방지