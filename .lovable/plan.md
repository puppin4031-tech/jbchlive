# A안: 자동 VOD 저장 제거 + 깨진 레코드 정리

라이브 송출 흐름은 그대로 유지하고, "라이브 매니페스트 URL이 VOD로 둔갑"하는 부분만 제거한다.

## 1. Edge Function 수정 — `supabase/functions/live-stream/index.ts`

`stopChannel` 케이스 (578–640행)에서 다음만 변경:

- `getHLSUrl` 호출 및 `recordingUrl` 변수 제거.
- `sermons` insert 블록(606–639행) 전체 제거.
- 응답에서 `vod` 필드 제거 → `result`는 GCP stop 결과만 반환.
- 채널 상태 업데이트(`is_live=false`, `gcp_channel_state='STOPPED'`, `stream_url=null`)는 유지.

라이브 시작/검증/송출 로직은 일체 손대지 않음.

## 2. 프론트엔드 정리 (최소 변경)

- `src/components/broadcaster/StopLiveDialog.tsx`: VOD 제목/카테고리/설교자 입력 필드가 있다면 제거하고 "라이브를 종료합니다" 확인 다이얼로그만 남김.
- `src/lib/liveStreamApi.ts`의 `stopChannel(channelId, vodOptions?)` 시그니처에서 `vodOptions` 인자 제거.
- `src/hooks/useBroadcasterChannel.ts`에서 stop 호출 시 vodOptions 전달 부분 제거 + 종료 후 "VOD 저장됨" 토스트가 있다면 "라이브가 종료되었습니다"로 변경.

## 3. 깨진 VOD 레코드 정리 (데이터 패치)

`live-output/.../manifest.m3u8` 패턴인 `sermons` 행을 모두 삭제.

```sql
DELETE FROM public.sermons
WHERE video_url LIKE 'https://storage.googleapis.com/%-live-output/%manifest.m3u8';
```

영향 범위 확인 후 실행 (예상 1건: `75ed2160-...`). 관련 `sermon_notes`는 FK가 없으므로 같은 마이그레이션에서 동일 sermon_id의 노트도 함께 정리할지 사용자에게 확인 후 결정.

## 4. 메모리 업데이트

`mem://features/obs-streaming-setup`에 "stopChannel은 GCP 채널 정지와 채널 상태 갱신만 수행. sermons 자동 insert 금지"를 명시(이미 no-auto-VOD 정책이 있다면 한 줄 강화).

## 5. 검증

1. 프론트 빌드 통과 확인.
2. Edge Function 로그로 `stopChannel` 호출 시 sermons insert 시도가 사라졌는지 확인.
3. `/vod/75ed2160-...` 접속 시 "영상을 찾을 수 없습니다" 표시(레코드 삭제됨).
4. 라이브 시작 → 정지 흐름 정상 동작(채널 `is_live=false`로 전환) 확인.

## 영향 범위 (기존 정상 동작 보존)

- 라이브 송출 시작/검증/RTMP 키/HLS 재생/실시간 알림: **변경 없음**.
- 외부(YouTube 등) 임베드로 등록되는 정상 sermons: **영향 없음** (URL 패턴 다름).
- 자동 녹화 기능: 제거됨. 향후 필요 시 B안(GCP archive)으로 별도 검토.
