

## 고유 라이브 링크 시스템

### 현재 문제
- `/live/:channelId` 라우트가 이미 존재하지만, mockData에서 라이브 상태를 가져오고 있어 실제 DB 연동이 안 됨
- 라이브가 아닐 때 "라이브 중인 말씀이 없습니다"만 표시되고 채널 정보가 없음

### 목표
트위치처럼 `/live/{channelId}` 링크가 **영구 고유 링크**로 동작하도록 개선:
- 라이브 중 → 영상 스트리밍 + 채널 정보 표시
- 라이브 아닐 때 → 채널 정보 + "현재 라이브가 아닙니다" + 최근 VOD 목록 표시
- 링크는 항상 동일하므로 한 번 공유하면 매번 재사용 가능

### 변경 사항

**1. `src/pages/LivePage.tsx` 전면 리팩터링**
- mockData 의존 제거 → Supabase `channels` 테이블에서 채널 정보 조회
- `channels.is_live` 상태에 따라 두 가지 뷰 분기:
  - **라이브 중**: HLS 플레이어 + 제목/설교자 + 시청자 수 + 공유 버튼
  - **오프라인**: 채널 로고/이름 + "현재 라이브가 아닙니다. 라이브가 시작되면 여기서 시청할 수 있습니다." 메시지 + 해당 채널 최근 설교(VOD) 목록
- `channels.stream_url`에서 HLS URL을 가져와 재생
- Supabase Realtime 구독으로 `is_live` 변경 시 자동 전환 (라이브 시작되면 새로고침 없이 플레이어 등장)

**2. 공유 기능 개선**
- 공유 버튼 클릭 시 항상 `/live/{channelId}` 형태의 고정 URL 복사
- 오프라인 상태에서도 공유 버튼 노출 (미리 링크 배포 가능)

**3. 라우팅** — 변경 없음
- 이미 `/live/:channelId`가 등록되어 있으므로 추가 라우트 불필요

### 기술 세부사항
- `useQuery`로 채널 데이터 fetch: `supabase.from('channels').select('*').eq('id', channelId)`
- `useQuery`로 최근 VOD fetch: `supabase.from('sermons').select('*').eq('channel_id', channelId).eq('is_live', false).order('sermon_date', { ascending: false }).limit(6)`
- Realtime: `supabase.channel('live-status').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels', filter: \`id=eq.${channelId}\` }, callback).subscribe()`
- DB 변경 불필요 (기존 `channels` 테이블에 `is_live`, `stream_url` 이미 존재)

