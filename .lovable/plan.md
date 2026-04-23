

## 라이브 상태 즉시 반영 안 되는 문제 수정

### 진단

DB에는 `channels.is_live = true`가 정상 저장되어 있는데, 홈/라이브 리스트/라이브 페이지에서 여전히 OFFLINE으로 보임.

원인 두 가지가 겹쳐 있습니다.

1. **Realtime UPDATE 이벤트의 `old` row가 비어 있음**
   `channels` 테이블의 `REPLICA IDENTITY`가 `default`(PK만 포함)로 설정돼 있음.
   `Index.tsx`는 `if (newRow.is_live && !oldRow.is_live)` 조건으로 LIVE 전환을 감지하는데, `oldRow.is_live`가 `undefined`로 들어오면서 일부 케이스에서 invalidate가 누락되거나 알림 배너가 안 뜸.
   → `REPLICA IDENTITY FULL`로 바꿔야 old row 전체가 같이 옴.

2. **방송 시작 직후 즉시 갱신 트리거 부족**
   - 송출자가 ChannelSettingsPage에서 "방송 시작"을 눌러 `is_live=true`로 업데이트해도, 현재 다른 탭/페이지(홈, /live, /live/:id)에서 이미 React Query 캐시가 살아 있으면 Realtime 누락 시 자동 갱신 수단이 없음.
   - `allChannels`/`liveChannels`/`channel(:id)` 쿼리에 `refetchOnWindowFocus`/`refetchOnMount`/짧은 `staleTime` 설정이 없음.

### 해결 방안

**A. DB: Realtime payload 보강**
마이그레이션 1줄:
```sql
ALTER TABLE public.channels REPLICA IDENTITY FULL;
```
이걸로 UPDATE 이벤트에 `old.is_live`가 정상적으로 들어와 false→true 전환 감지가 안정됨. (publication은 이미 등록돼 있어 추가 작업 없음)

**B. Index.tsx: 알림 감지 로직 방어적으로**
- `oldRow.is_live`가 `undefined`인 경우도 처리: `newRow.is_live === true`면 무조건 invalidate(배너는 false→true 전환에서만).
- 이벤트 페이로드에 관계없이 `is_live` 변화 시 모든 관련 쿼리 invalidate.

**C. React Query 설정 강화 (홈/리스트/LivePage)**
관련 라이브 쿼리에 다음 추가:
- `refetchOnWindowFocus: true`
- `refetchOnMount: 'always'`
- `staleTime: 0`

이러면 Realtime이 깜빡 누락되더라도 탭 복귀/페이지 진입만으로 즉시 최신 상태가 보임.

**D. ChannelSettingsPage: 방송 시작 직후 캐시 무효화**
"방송 시작" mutation 성공 시 클라이언트에서 직접:
```ts
queryClient.invalidateQueries({ queryKey: ['live-channels'] });
queryClient.invalidateQueries({ queryKey: ['all-approved-channels'] });
queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
```
송출자 본인 화면에서도 즉시 LIVE 뱃지가 뜨도록.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `supabase/migrations/<new>.sql` | `ALTER TABLE public.channels REPLICA IDENTITY FULL;` |
| `src/pages/Index.tsx` | Realtime 핸들러 방어 처리 + `liveChannels`/`allChannels`/`liveSermons-home` 쿼리 옵션 추가 |
| `src/pages/LivePage.tsx` | `channel`/`live-sermon` 쿼리 옵션 추가 (focus/mount refetch, staleTime 0) |
| `src/pages/LiveListPage.tsx` | `live-channels-list` 쿼리 옵션 추가 |
| `src/pages/ChannelSettingsPage.tsx` | 방송 시작/종료 후 관련 라이브 쿼리 invalidate |

### 검증 단계

1. 마이그레이션 후 ChannelSettingsPage에서 방송 시작 → 같은 화면에 LIVE 뱃지 즉시 표시
2. 다른 탭에서 홈을 열어둔 상태 → 빨간 알림 배너가 자동으로 슬라이드 다운, "교회 라이브 링크" 카드의 OFFLINE → LIVE로 즉시 전환
3. `/live/:channelId` 직접 새로고침 → 오프라인 박스가 사라지고 플레이어 영역으로 전환
4. 방송 종료 시 모든 화면이 OFFLINE으로 즉시 복귀

