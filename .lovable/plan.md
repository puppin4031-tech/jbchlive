## 목표
- **즐겨찾기**: 영상(설교)만 대상. VOD 페이지와 SermonCard에 하트 토글 추가.
- **구독**: 채널 대상. ChannelPage / ChannelCard 의 구독 버튼을 DB 연동.
- **즐겨찾기 페이지**: 즐겨찾기한 영상 리스트 표시 (기존 페이지 단순화 - 채널 섹션 제거).
- **구독 페이지 신설 (`/subscriptions`)**: 구독한 채널들의 영상이 최신순으로.
- **카드 노출 정보 축소**: 홈 / 구독 페이지 SermonCard에서 조회수·날짜 숨김. (썸네일·제목·설교자만)

## 1. DB 마이그레이션
- `subscriptions` 테이블 신설: `user_id`, `channel_id`, UNIQUE(user_id, channel_id)
- RLS: 본인 행만 select/insert/delete, public이 channel_id별 count는 별도 RPC 또는 trigger 유지
- 트리거: insert/delete 시 `channels.subscriber_count` 자동 증감
- `notify_live_lifecycle` 확장: 라이브 시작 시 구독자에게 알림 (선택)

## 2. 새 훅
- `src/hooks/useSubscriptions.ts`: `subscriptions` 목록, `isSubscribed(channelId)`, `toggleSubscription` mutation

## 3. 컴포넌트 변경
- **SermonCard**: `compact?: boolean` prop 추가 → true이면 조회수/날짜 라인 숨김
- **ChannelCard**: 구독 버튼을 `useSubscriptions` 연결, 로그인 안 됨이면 toast + `/login`
- **ChannelPage**: 로컬 `useState(subscribed)` → `useSubscriptions` 연결. 즐겨찾기 버튼은 채널엔 의미 적으므로 제거 (또는 그대로 두되 영상 즐겨찾기와 혼동 방지 — 사용자 요청대로 즐겨찾기=영상이므로 채널페이지 즐겨찾기 버튼 제거)
- **VodPage**: 제목 옆/아래 하트 토글 추가 → `useFavorites('sermon', sermonId)`
- **Header 드롭다운**: "구독" 메뉴 추가 (`/subscriptions`)

## 4. 새 페이지
- `src/pages/SubscriptionsPage.tsx`
  - 내 `subscriptions` → channel_id 목록
  - `sermons` from those channels, `is_live=false`, order by `sermon_date desc`, limit 50
  - SermonCard `compact` 모드로 그리드 표시
  - 구독한 채널 없으면 안내 메시지
- App.tsx에 `/subscriptions` 라우트 추가 (Protected)

## 5. FavoritesPage 단순화
- 채널 섹션 제거, 영상만 표시 (SermonCard compact 그리드)

## 6. 홈 (Index.tsx)
- VOD 그리드의 SermonCard에 `compact` prop 전달

## 기술 세부
- 구독 카운트: `channels.subscriber_count`는 트리거로 동기화. RLS상 count는 owner만 직접 row count 가능하므로 표시값은 `subscriber_count` 컬럼으로 사용.
- 구독 페이지 쿼리: `supabase.from('sermons').select('*, channels!inner(name, logo_url)').in('channel_id', ids)` — RLS 통과 (sermons는 public select)
- compact 모드 구현: SermonCard 내 조회수/날짜 `<p>` 줄을 `!compact &&`로 감쌈.

## 영향 받지 않는 부분
- 썸네일 업로드, 보안 RLS 정책, 라이브 송출, 알림 등 기존 코드 유지
- favorites 테이블/훅은 유지 (item_type 'sermon'만 사용)
