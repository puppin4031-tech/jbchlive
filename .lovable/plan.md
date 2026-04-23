

## 라이브 노출/공유 시스템 정비

### 현재 상태 진단

**문제 1: `/live` 페이지가 비어있음**
- `LiveListPage`는 `channels.is_live=true AND sermons.is_live=true`를 **`!inner` 조인**으로 요구
- "라이브 시작" 버튼은 `channels.is_live`만 true로 바꾸고, **sermon 레코드를 자동 생성하지 않음**
- → 채널은 라이브 중이지만 sermon이 없어서 리스트에서 제외됨

**문제 2: 홈에서 라이브 진입 동선이 약함**
- `Index.tsx`에 라이브 알림 배너가 있긴 하지만, 라이브 채널이 여러 개일 때 한 채널만 보이거나 자동 이동 동선이 모호

**문제 3: 라이브 링크 공유 위치가 분산됨**
- 라이브 페이지(`/live/:channelId`) 안에만 공유 버튼 존재
- 송출자(ChannelSettingsPage)가 방송 시작 직후 링크를 복사할 수 없음

---

### 해결 방안

#### A. `/live` 리스트가 sermon 없이도 채널 자체를 보여주도록 수정
`LiveListPage`를 **채널 기반**으로 변경. sermon이 있으면 sermon 정보를, 없으면 채널 정보(이름/로고/"라이브 중")만으로 카드 렌더링.

```text
┌──────────────────────────┐
│ [채널 로고]  채널명      │
│ 🔴 LIVE  · 23명 시청 중   │
│ → 클릭 시 /live/:channelId │
└──────────────────────────┘
```

#### B. 홈(`Index.tsx`)에 라이브 채널 섹션 추가
페이지 최상단에 **"🔴 지금 라이브 중"** 섹션을 배치:
- 라이브 채널이 1개면 큰 카드 + "지금 시청하기" 버튼 → `/live/:channelId`
- 여러 개면 가로 스크롤 카드 리스트
- 라이브가 0개면 섹션 자체 숨김
- Realtime으로 `channels.is_live` 변화 구독 → 새로고침 없이 자동 등장/사라짐

#### C. ChannelSettingsPage에 라이브 공유 박스 추가
"라이브 시작" 버튼 영역 아래에 영구 라이브 URL 박스:
```
라이브 시청 링크 (영구)
[https://jbchlive.lovable.app/live/{id}] [복사] [새 탭]
이 링크는 변하지 않습니다. SNS·문자로 공유하세요.
```
라이브 시작 토스트에도 "링크가 복사되었습니다" 옵션 추가.

#### D. LivePage 빈 상태 개선
`is_live=true`인데 stream_url이 없거나 sermon이 없는 경우에도 채널 정보 + "방송 준비 중" 안내가 깔끔히 표시되도록 fallback 보강 (현재도 일부 처리되어 있으나 문구/UX 정리).

---

### 기술 변경 요약

| 파일 | 변경 |
|---|---|
| `src/pages/LiveListPage.tsx` | 쿼리를 `channels` 단독 select로 변경(`is_live=true AND is_approved=true AND is_suspended=false`), sermon은 LEFT JOIN으로 옵셔널 표시 |
| `src/pages/Index.tsx` | 최상단에 "지금 라이브 중" 섹션 추가 + Realtime 구독으로 자동 갱신 |
| `src/pages/ChannelSettingsPage.tsx` | 라이브 시작 버튼 근처에 영구 라이브 URL 공유 박스(복사/새탭) 추가 |
| `src/pages/LivePage.tsx` | sermon 없는 라이브 상태 fallback 문구·레이아웃 정리 |

DB 마이그레이션, 엣지 함수 변경 없음. 영구 링크 형식은 기존 `/live/:channelId` 그대로 유지.

### 사용자 다음 단계
1. 적용 후 홈(`/`) 새로고침 → 라이브 채널이 상단에 노출되는지 확인
2. `/live` 진입 시 현재 라이브 채널 카드가 표시되는지 확인
3. ChannelSettingsPage에서 공유 링크 복사 → 다른 브라우저/시크릿창에 붙여넣어 시청 확인

