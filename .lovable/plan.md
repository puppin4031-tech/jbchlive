## 문제
`src/hooks/useBroadcasterChannel.ts` 의 realtime 구독이 React StrictMode 더블 마운트에서 같은 이름(`broadcaster-channel-${channelId}`)으로 `supabase.channel()`을 호출하면서 이미 subscribe된 인스턴스를 재사용 → `.on()` 호출 시 "cannot add postgres_changes callbacks after subscribe()" 런타임 에러 → 흰 화면.

## 수정
`src/hooks/useBroadcasterChannel.ts` 53번째 줄, 채널 이름에 고유 suffix 추가:

```ts
.channel(`broadcaster-channel-${channelId}-${Math.random().toString(36).slice(2)}`)
```

이 한 줄 변경으로 매 effect 실행마다 새 채널 인스턴스가 생성되어 충돌 해소.