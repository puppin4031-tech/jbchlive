# 커뮤니티 페이지 구축 계획

회원 전용 커뮤니티를 만듭니다. 이미지/포스터 중심의 미디어 피드와 텍스트 게시판을 섞은 하이브리드 구조이며, 모바일 세로형에 최적화합니다.

## 1. 화면 구성

### 커뮤니티 메인 (`/community`)
- **카테고리 탭 (상단 고정)**: 전체 | 필독/공지 | 게시판 | 미디어나눔 | 자료실 | 자유수다 — 횡스크롤 버튼, 기존 CategoryTabs 스타일 재사용
- **검색창**: 제목·본문 검색 (카테고리 필터와 결합)
- **공지 영역**: 관리자 작성 공지 3건을 얇은 리스트로 상단 고정 + "공지사항 더보기"
- **미디어나눔/자료실 피드**: 모바일 1열, 데스크톱 2열 카드. 포스터 이미지 크게 노출 + 제목/작성자/댓글 수
- **통합 게시판**: 말머리 뱃지 + 제목 위주 리스트 (작성자, 조회수)
- **자유수다 인기글**: 최근 7일 내 조회수·댓글 기준 상위 3건
- **플로팅 글쓰기 버튼**: 우측 하단 고정 원형 버튼 (로그인 회원만 노출)

### 글 상세 (`/community/:postId`)
본문 + 이미지 갤러리 + 첨부파일 다운로드 + 댓글 목록/작성. 작성자·관리자만 수정/삭제. 조회수 증가.

### 글쓰기/수정 (`/community/write`, `/community/:postId/edit`)
카테고리 선택, 말머리, 제목, 본문, 이미지 다중 업로드(미리보기·삭제), 문서 첨부. 공지 카테고리는 관리자에게만 노출.

### 카테고리 목록 (`/community/category/:slug`)
"더보기" 링크 대상. 무한스크롤 대신 페이지네이션(20건).

## 2. 권한 규칙
- 읽기: 로그인 회원 전용 (비로그인 → 로그인 페이지 안내). 기존 영상 시청 공개 정책은 그대로 유지
- 쓰기/댓글: 로그인 회원
- 공지/필독 카테고리 작성: 관리자만
- 수정/삭제: 작성자 본인 또는 관리자

## 3. 업로드 정책 (비용 절감)
- 이미지: 업로드 전 브라우저에서 WebP 변환 + 리사이즈(최대 1600px, 목표 500KB). 글당 최대 5장
- 문서: PDF/PPT/PPTX/DOC/DOCX/XLS/XLSX, 파일당 10MB, 글당 최대 3개
- 영상 업로드 전면 차단 (MIME 화이트리스트로 서버·클라이언트 양쪽 차단)
- 글 삭제 시 연결된 스토리지 파일도 삭제

## 4. 기술 상세

### 데이터베이스 (마이그레이션)
- `community_categories`: slug, name, sort_order, admin_only, icon
- `community_posts`: id, category_id, author_id, title, body, tag(말머리), image_urls text[], view_count, comment_count, is_pinned, is_hidden, created_at/updated_at
- `community_attachments`: post_id, file_name, file_path, file_size, mime_type
- `community_comments`: post_id, author_id, body, parent_id(대댓글), created_at
- 모든 테이블: GRANT (authenticated / service_role) → RLS 활성화 → 정책
  - SELECT: `authenticated`만 (anon 권한 없음), 숨김글 제외
  - INSERT: `auth.uid() = author_id`, 공지 카테고리는 `has_role(auth.uid(),'admin')`
  - UPDATE/DELETE: 작성자 또는 admin
- 댓글 수 동기화 트리거, `increment_post_view` 보안 정의 함수, `updated_at` 트리거

### 스토리지
- `community-images` (공개, 5MB, image/webp·jpeg·png)
- `community-files` (비공개, 10MB, 문서 MIME만) — 다운로드는 서명 URL
- 경로 `{user_id}/{uuid}.ext`, storage.objects RLS로 본인 폴더 쓰기만 허용

### 프론트엔드
- `src/lib/imageCompress.ts` 확장: WebP 출력 옵션 추가
- 신규: `src/pages/CommunityPage.tsx`, `CommunityPostPage.tsx`, `CommunityWritePage.tsx`, `CommunityCategoryPage.tsx`
- 신규 컴포넌트: `community/PostCard`, `PostListItem`, `NoticeStrip`, `HotPosts`, `PostEditor`, `ImageUploader`, `FileUploader`, `CommentList`, `FloatingWriteButton`
- 훅: `useCommunityPosts`, `useCommunityPost`, `useCommunityComments` (React Query, `staleTime: 60_000`으로 기존 캐시 정책 유지)
- 라우팅: 커뮤니티 경로 전체 `ProtectedRoute`로 감싸기, 헤더 내비게이션에 "커뮤니티" 추가
- 디자인: 기존 Noto Sans KR / 베이지·파스텔블루 토큰과 모바일 큰 글씨·3rem 탭 타깃 규칙 준수

## 5. 진행 순서
1. 마이그레이션 + 스토리지 버킷 + 기본 카테고리 시드
2. 훅과 공용 컴포넌트
3. 메인/상세/글쓰기/카테고리 페이지, 라우팅·헤더 연결
4. 업로드 압축·차단 정책 검증 및 권한 테스트
