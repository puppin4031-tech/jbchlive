

## 라이브 페이지 흰 화면 + 영구 링크 노출 개선

### 문제 진단

**1. 라이브 페이지 흰 화면 (React Hooks 위반)**
`src/pages/LivePage.tsx`에서 `useViewerCount(channelId, isLive)` 훅이 **조건부 early return(`if (channelLoading)`, `if (!channel)`) 이후**에 호출됨. React Hooks 규칙 위반 → 로딩이 끝나는 순간 훅 호출 순서가 바뀌면서 컴포넌트가 크래시 → 흰 화면. 흰 화면 + URL 변화로 일부 환경에서 Lovable 프리뷰 fallback 페이지가 잠깐 보일 수 있음.

**2. 라이브가 꺼져있을 때 화면이 빈약함**
DB 확인 결과 채널은 존재하나 `is_live=false`, `logo_url=null`, `stream_url=null` 상태. 현재 fallback은 `VideoOff` 아이콘과 짧은 문구만 표시 → "흰 화면처럼 보임"의 또 다른 원인.

**3. 홈 상단에 항상 보이는 "라이브 링크" 카드 부재**
현재 홈 상단 "지금 라이브 중" 섹션은 `is_live=true`인 채널만 노출. 라이브가 꺼져있으면 섹션 자체가 사라져, 사용자가 채널의 영구 라이브 링크에 접근할 입구가 없음.

---

### 해결 방안

#### A. LivePage Hooks 위반 수정 (흰 화면 해결)
- `useViewerCount`를 컴포넌트 본문 **상단**(early return 이전)으로 이동
- `useParams`, `useQuery`, `useEffect`, `useViewerCount` 모두 항상 같은 순서로 호출되도록 정리
- 안전한 fallback: `channelId`가 없으면 0 반환은 훅 내부에서 이미 처리됨

#### B. 라이브 OFF 상태 fallback UI 강화
플레이어 영역에 다음을 표시:
- 채널 로고(없으면 placeholder) + 채널명을 큰 카드로
- "현재 오프라인" 배지
- "라이브가 시작되면 이 페이지에서 자동 재생됩니다" 안내
- 공유 버튼 + 링크 박스(영구 URL 표시 + 복사) — 라이브 OFF 상태에서도 시청자가 링크 공유 가능

#### C. 홈 상단 "채널 라이브 링크" 섹션 추가 (영구 노출)
홈(`Index.tsx`) 상단, "지금 라이브 중" 섹션과는 별개로 **항상 표시되는** "교회 라이브 링크" 가로 스크롤 섹션:
- 모든 승인된 채널의 카드 표시 (`is_approved=true AND is_suspended=false`)
- 각 카드: 로고(없으면 기본 썸네일 `/placeholder.svg`) + 채널명 + 라이브 상태 뱃지(LIVE / OFFLINE)
- 클릭 시 해당 채널의 영구 라이브 링크(`/live/:channelId`)로 이동
- 라이브 중인 채널은 빨간 LIVE 뱃지 + 펄스 애니메이션으로 강조, 오프라인 채널은 회색 뱃지

```text
교회 라이브 링크
┌────────┐ ┌────────┐ ┌────────┐
│ [로고] │ │ [로고] │ │ [로고] │
│ 🔴LIVE │ │ OFFLINE│ │ OFFLINE│
│ 채널A  │ │ 채널B  │ │ 채널C  │
└────────┘ └────────┘ └────────┘
       (클릭 → /live/{id})
```

#### D. LivePage 메타 (OG/title) 보강 (옵션)
공유 시 카카오톡/SNS 미리보기에서 채널명이 보이도록 `document.title` 동적 설정.

---

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/LivePage.tsx` | `useViewerCount` 호출 위치를 early return 이전으로 이동(훅 규칙 준수). 오프라인 fallback UI를 채널 로고/이름/공유링크 카드로 확장 |
| `src/pages/Index.tsx` | 홈 상단에 "교회 라이브 링크" 섹션 추가(승인된 모든 채널 가로 스크롤, LIVE/OFFLINE 상태 뱃지 + 영구 링크) |

DB 마이그레이션, 엣지 함수, 라우팅 변경 없음. 영구 링크 형식 `/live/:channelId` 그대로 유지.

### 사용자 확인 단계
1. 적용 후 `/live/b456e635-...` 직접 접속 → 흰 화면 없이 채널 카드 + "오프라인" + 공유 링크 표시 확인
2. 홈(`/`) 상단에 "교회 라이브 링크" 섹션이 라이브 여부와 관계없이 항상 노출되는지 확인
3. 카드 클릭 시 영구 라이브 링크로 이동, 링크 복사 후 시크릿창에서 접속 확인

