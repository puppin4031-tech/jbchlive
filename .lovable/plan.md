

## 외부 스토리지 영상 관리 시스템

### 목표
채널 소유자가 기존 영상(NAS, Google Cloud Storage, 기타 외부 URL)을 등록하고 관리할 수 있는 설교 영상 관리 기능 추가.

### 변경 사항

**1. 설교(영상) 관리 페이지 생성 — `src/pages/ManageSermonsPage.tsx`**
- 내 채널의 설교 목록 조회 (CRUD)
- **영상 등록 폼**:
  - 제목, 설교자, 날짜, 카테고리(주일말씀/수요말씀/특별집회), 설명
  - **영상 URL 입력**: 외부 URL 직접 입력 (GCS, NAS, YouTube, 자체 서버 등 아무 URL)
  - **썸네일 URL 입력**: 외부 이미지 URL 직접 입력
- 등록된 영상 목록에서 수정/삭제 가능
- `sermons` 테이블의 `video_url` 필드에 외부 URL 저장

**2. RLS 정책 추가 — DB 마이그레이션**
- 현재 `sermons` 테이블은 admin만 INSERT/UPDATE/DELETE 가능
- 채널 소유자도 자기 채널의 설교를 관리할 수 있도록 RLS 정책 추가:
  - `Owners can insert sermons`: channel_id가 본인 소유 채널인 경우 INSERT 허용
  - `Owners can update own sermons`: 동일 조건으로 UPDATE 허용
  - `Owners can delete own sermons`: 동일 조건으로 DELETE 허용

**3. VodPage 수정 — `src/pages/VodPage.tsx`**
- mockData 의존 제거 → Supabase `sermons` + `channels` 테이블에서 데이터 조회
- `video_url` 필드의 외부 URL을 VideoPlayer에 전달

**4. MyChannelPage에 영상 관리 버튼 추가**
- "영상 관리" 버튼 → `/channel/:channelId/sermons` 으로 이동

**5. 라우팅 추가 — `src/App.tsx`**
- `/channel/:channelId/sermons` → ManageSermonsPage

### 기술 세부사항

- 외부 URL은 별도 업로드 없이 `sermons.video_url`에 직접 저장
- HLS(.m3u8), MP4 등 다양한 형식을 VideoPlayer가 이미 지원
- RLS 정책에서 소유자 확인: `EXISTS (SELECT 1 FROM channels WHERE id = sermons.channel_id AND owner_id = auth.uid())`
- DB 마이그레이션 1건 필요 (소유자용 RLS 정책 3개 추가)

