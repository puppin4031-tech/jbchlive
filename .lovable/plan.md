

## 모더레이션 + 알림 센터 통합 플랜

요청하신 두 영역을 합치면 큰 작업이라 **3단계로 분할**해서 단계별 승인 진행을 추천드립니다. 아래는 전체 청사진 + 1단계 상세입니다.

---

### 추가 제안 아이디어 (Live Word Mission 맞춤)

| 아이디어 | 설명 | 추천도 |
|---|---|---|
| **신고 사유 템플릿** | "이단 교리 / 부적절한 영상 / 저작권 / 기타" 라디오 선택 — 어르신도 쉽게 | ⭐⭐⭐ |
| **채널 정지 사유 공개** | 정지된 채널 페이지에 "관리자 검토 중" 배너 표시 (투명성) | ⭐⭐⭐ |
| **자동 비공개 처리** | 신고 3건 누적 시 영상 자동 임시 비공개 → 관리자 검토 대기 | ⭐⭐ |
| **공지사항 페이지** | 알림 + `/notices` 별도 페이지에서 과거 공지 다시 읽기 | ⭐⭐⭐ |
| **새 영상 미리보기** | 알림 클릭 시 영상 썸네일 + 제목 미리보기 | ⭐⭐ |
| **이메일 백업 알림** | 로그인 안 한 동안 쌓인 알림을 이메일로 요약 발송 (선택형) | ⭐⭐ |

---

### 전체 청사진 (3단계)

```
[1단계] 모더레이션 기반 (DB + 관리자 도구)
  - 채널 정지(suspended) + 영상 비공개(hidden) 컬럼
  - 영상 신고(reports) 테이블 + 답변(report_replies) 테이블
  - 관리자 페이지 탭: 신고 목록, 채널 정지 토글
  - 채널 소유자: 내 영상 신고 목록 + 답변 가능

[2단계] 알림 시스템 기반
  - notifications 테이블 (type, title, body, link, read_at)
  - 헤더 종 아이콘 + 읽지않음 배지 + 드롭다운 목록
  - Realtime 구독으로 즉시 표시
  - 알림 종류: 신규영상/라이브시작/관리자메시지/공지

[3단계] 알림 트리거 자동화
  - 채널 구독자에게 신규 영상 알림 (sermons INSERT 트리거)
  - 라이브 시작 시 구독자 알림 (channels.is_live UPDATE 트리거)
  - 관리자→사용자 메시지 발송 UI
  - 공지사항 작성 UI (전체 사용자 broadcast)
```

---

### 🎯 1단계 상세 플랜 (이번 승인 범위)

#### DB 마이그레이션
```sql
-- 채널 정지
ALTER TABLE channels ADD COLUMN is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN suspended_reason text;

-- 영상 비공개
ALTER TABLE sermons ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE sermons ADD COLUMN hidden_reason text;

-- 신고 테이블
CREATE TABLE sermon_reports (
  id uuid PK, sermon_id uuid, reporter_id uuid,
  reason text,           -- 'heresy' | 'inappropriate' | 'copyright' | 'other'
  detail text,
  status text DEFAULT 'open',  -- 'open' | 'resolved' | 'dismissed'
  admin_note text,
  created_at, updated_at
);

-- 신고 답변 (채널 담당자/관리자/신고자 대화)
CREATE TABLE sermon_report_replies (
  id uuid PK, report_id uuid, author_id uuid,
  author_role text,      -- 'reporter' | 'owner' | 'admin'
  body text, created_at
);
```

**RLS 핵심**:
- `sermon_reports` SELECT: 신고자 본인 / 해당 채널 소유자 / 관리자
- `sermon_reports` INSERT: 인증된 누구나 (자기 ID로만)
- `sermon_report_replies` SELECT: 위와 동일 / INSERT: 관련자 3자만
- 공개 SELECT 정책 (`Sermons viewable by everyone`)을 `is_hidden = false` 조건으로 변경
- `Channels viewable` 정책에 `is_suspended = false` 조건 추가 (관리자/소유자는 예외)

#### UI 변경

**1. VOD 카드/페이지에 신고 버튼 추가**
- `SermonCard` 우측 상단 ⋯ 메뉴 → "신고하기"
- 다이얼로그: 사유 라디오(이단/부적절/저작권/기타) + 상세 텍스트

**2. AdminPage 새 탭**
- **신고 관리**: open 상태 신고 목록, 영상 미리보기, 답변 스레드, [영상 비공개] [신고 종료] 버튼
- **채널 정지**: 전체 채널 옆 [정지/해제] 토글 + 사유 입력

**3. ManageSermonsPage (채널 소유자)**
- 내 영상 카드에 신고 건수 배지 (🚩 N)
- "받은 신고" 섹션 추가 → 답변 작성 가능

**4. 공개 페이지**
- `is_hidden=true` 영상은 목록/검색에서 제외
- `is_suspended=true` 채널은 페이지 진입 시 "검토 중" 안내

#### 파일 변경 예상
- `supabase/migrations/*` (신규)
- `src/pages/AdminPage.tsx` (신고 탭 + 정지 토글 추가)
- `src/pages/ManageSermonsPage.tsx` (신고 받은 목록 + 답변)
- `src/components/SermonCard.tsx` (신고 버튼)
- `src/components/ReportDialog.tsx` (신규)
- `src/pages/ChannelPage.tsx` (정지 채널 안내)

---

### 다음 단계 진행 방식
이 1단계를 먼저 승인/구현 후 → **2단계 알림 센터** → **3단계 자동 트리거** 순으로 진행하는 걸 권장드립니다. 한 번에 다 하면 테스트가 어렵고 버그 추적이 힘듭니다.

위 1단계로 시작할까요? 아니면 우선순위를 바꾸거나 추가 아이디어를 포함하고 싶으시면 말씀해주세요.

