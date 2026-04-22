

## Google Drive 썸네일 자동 추출 적용

### 변경 파일 (2개)

**1. `src/lib/thumbnailUtils.ts`**
- `extractDriveId(url)` 추가 — `/file/d/{ID}/`, `?id={ID}`, `/folders/{ID}` 패턴 매칭
- `getDriveThumbnails(fileId)` 추가 — 4가지 사이즈 후보 반환:
  ```
  https://drive.google.com/thumbnail?id={ID}&sz=w1920
  https://drive.google.com/thumbnail?id={ID}&sz=w1280
  https://drive.google.com/thumbnail?id={ID}&sz=w640
  https://drive.google.com/thumbnail?id={ID}&sz=w320
  ```
- `detectSource()`에 `'drive'` 케이스 신설 (현재는 `unsupported`로 떨어짐)
- `ThumbnailSource` 타입에 `'drive'` 추가

**2. `src/components/ThumbnailPicker.tsx`**
- `useEffect` 분기에 `source === 'drive'` 처리 추가 (YouTube와 동일하게 즉시 후보 제공)
- `unsupported` 안내 문구는 유지 (다른 외부 서비스용)
- 드라이브 안내 문구 추가: *"공유 설정이 '링크가 있는 모든 사용자에게 공개'여야 썸네일이 표시됩니다"*

### 동작
- 사용자가 구글드라이브 URL 입력 → 즉시 4종 썸네일 후보 노출 → 클릭 선택 → DB 저장
- 라이브 / 직접 URL / 수동 입력은 이번 범위 외 (다음 단계)

