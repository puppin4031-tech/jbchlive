# 설교 썸네일 직접 업로드 기능 추가

## 목표
ManageSermonsPage의 설교 등록/수정 폼에서 자동 추출된 썸네일 후보와 함께 사용자가 직접 이미지를 업로드하여 썸네일로 사용할 수 있게 한다.

## 변경 사항

### 1. Storage 버킷 (마이그레이션)
- 신규 public 버킷 `sermon-thumbnails` 생성 (이미 존재함 — 확인 후 재사용)
- RLS 정책:
  - SELECT: 모두 허용 (public)
  - INSERT/UPDATE/DELETE: 인증된 사용자 중 해당 채널 owner 또는 admin
- 파일 제한: 5MB, image/* MIME만 허용

### 2. `src/components/ThumbnailPicker.tsx` 수정
- 상단에 **"직접 업로드"** 영역 추가 (파일 선택 + 드래그&드롭)
- 업로드된 이미지는 자동 추출 후보 그리드의 첫 번째 항목으로 표시되고 자동 선택됨
- 업로드 진행 상태 / 에러 처리 / 5MB 초과 검증
- 업로드 성공 시 Storage public URL을 `onChange`로 전달
- 자동 추출 후보와 동일한 선택 UI(체크 표시) 유지

### 3. `src/pages/ManageSermonsPage.tsx`
- 별도 수정 없음 — 기존 `<ThumbnailPicker>` 통합으로 자동 적용
- 필요 시 업로드된 URL이 외부 검증 트리거(`validate_sermon_urls`)를 통과하는지 확인 (Supabase Storage URL은 https이므로 OK)

## 기술 메모 (개발자용)
- 업로드 경로: `sermon-thumbnails/{channel_id}/{timestamp}-{random}.{ext}`
- `supabase.storage.from('sermon-thumbnails').upload(...)` → `getPublicUrl(...)`
- 기존 자동 추출 로직(`detectSource`, `getYouTubeThumbnails` 등)은 그대로 유지
- 업로드 영역은 비디오 URL이 비어있어도 사용 가능하도록 컴포넌트 가드 조정

## 변경 파일
- `supabase/migrations/*.sql` (storage 정책 — 버킷이 이미 있으면 정책만 갱신)
- `src/components/ThumbnailPicker.tsx`
