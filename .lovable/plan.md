## 어디서든 보이는 송출 컨트롤 (Broadcaster Control)

매번 채널 설정 페이지로 이동하지 않아도 라이브 시작/종료/상태 확인이 가능하도록 두 가지 진입점을 추가합니다.

### 1. 플로팅 송출 패널 (FloatingBroadcasterDock)

채널 소유자(승인된 채널 보유자)에게만 **모든 페이지 우측 하단**에 떠있는 작은 도크.

```text
                                    ┌──────────────────────┐
                                    │ ● 라이브 중  12:34   │
                                    │ ▣ STREAMING          │
                                    │ [⏹ 종료]  [설정 ⚙]   │
                                    └──────────────────────┘
                                              ↑
                                    오프라인일 땐 접힌 형태:
                                    ┌──────────┐
                                    │ ▶ 시작   │
                                    └──────────┘
```

**상태별 표시:**
| 상태 | 도크 모양 | 액션 버튼 |
|---|---|---|
| 오프라인 | 작은 둥근 버튼 "▶ 라이브 시작" | 클릭 → 시작 확인 다이얼로그 |
| 서버 준비 중 (STARTING) | 노랑 펄스 + spinner + "준비 중..." | (대기) |
| OBS 대기 (AWAITING_INPUT) | 파랑 + "OBS 대기 중" | RTMP 정보 보기 |
| 송출 중 (STREAMING) | 빨강 펄스 + 경과 시간 | ⏹ 종료, ⚙ 설정 |
| 에러 | 빨강 ⚠ + 메시지 1줄 | 자세히/숨기기 |

**동작:**
- 사용자가 로그인 + 채널 소유 + `is_approved`일 때만 마운트
- 접힌 상태(👈 오프라인) ↔ 펼친 상태 토글 가능, localStorage에 사용자 선호 저장
- "라이브 종료" 클릭 시 → 기존 VOD 저장 다이얼로그(제목/카테고리/설교자) 그대로 재사용
- "라이브 시작" 클릭 시 → 시작 후 GCP 준비 다이얼로그(STARTING → AWAITING_INPUT 폴링) 그대로 재사용
- 라이브 시청 페이지(`/live/:channelId`)에서는 본인 방송이면 도크 숨김(혼동 방지)

### 2. 내 채널 페이지(/my-channel) 인라인 컨트롤

도크와 동일한 컨트롤을 채널 카드 안에도 내장하여, 도크가 거추장스러운 사용자도 한 번에 제어 가능하게 함.

`MyChannelPage` 채널 오버뷰 카드(74-134줄) 안 "Quick Stats" 위에 `<BroadcasterControlPanel channel={channel} />` 삽입:
- 큰 시작/종료 버튼 (h-14, 노인 사용자 친화)
- 상태 뱃지 + 경과 시간 + RTMP 빠른 복사 (펼치기)
- 에러 발생 시 빨간 박스로 표시

### 3. 컴포넌트 구조 (재사용)

공통 로직을 훅으로 추출:

**`src/hooks/useBroadcasterChannel.ts`** (신규)
- 현재 로그인 사용자의 채널 1개 조회 (`my-channel` 쿼리 재사용)
- GCP 상태 폴링 로직 (`ChannelSettingsPage` 70-99줄에서 추출)
- Realtime subscription: `channels` 테이블의 본인 채널 row 변화 구독 (다른 탭에서 시작/종료해도 즉시 반영)
- `startLive` / `stopLive` mutation 노출
- 반환: `{ channel, gcpState, pollAttempts, lastPolledAt, startLive, stopLive, refresh }`

**`src/components/broadcaster/BroadcasterControlPanel.tsx`** (신규, 인라인용)
- 큰 카드 형태, MyChannelPage 안에 삽입

**`src/components/broadcaster/FloatingBroadcasterDock.tsx`** (신규, 플로팅용)
- `fixed bottom-4 right-4 z-40`, 모바일에서는 `bottom-2 right-2`
- 내부에서 `BroadcasterControlPanel`의 컴팩트 변형 렌더링
- `App.tsx`에 단일 마운트, 라우트 따라 자동 표시/숨김

**`src/components/broadcaster/StartLiveDialog.tsx` / `StopLiveDialog.tsx`** (신규)
- 기존 `ChannelSettingsPage`의 startingDialog(442-491줄) + stopDialog(494-550줄)를 분리
- 양쪽(도크/내 채널/채널 설정)에서 공유

### 4. ChannelSettingsPage 정리

- 기존 라이브 시작/종료 UI(305-340줄), 폴링 effect(70-99줄), 두 다이얼로그를 새 컴포넌트로 교체
- RTMP 키/OBS 가이드 등 "설정" 영역만 남김

### 5. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `src/hooks/useBroadcasterChannel.ts` | 신규: 상태 폴링 + Realtime + mutation |
| `src/components/broadcaster/BroadcasterControlPanel.tsx` | 신규: 인라인/컴팩트 변형 지원 |
| `src/components/broadcaster/FloatingBroadcasterDock.tsx` | 신규: 플로팅 도크 |
| `src/components/broadcaster/StartLiveDialog.tsx` | 신규: 시작 폴링 다이얼로그 분리 |
| `src/components/broadcaster/StopLiveDialog.tsx` | 신규: 종료+VOD 저장 다이얼로그 분리 |
| `src/App.tsx` | `<FloatingBroadcasterDock />` 전역 마운트 |
| `src/pages/MyChannelPage.tsx` | 채널 카드에 `BroadcasterControlPanel` 삽입 |
| `src/pages/ChannelSettingsPage.tsx` | 라이브 컨트롤 부분을 새 컴포넌트로 치환 |

### 6. DB / Edge Function 변경

**불필요.** 기존 `live-stream` Edge Function (startChannel/stopChannel/getStatus)과 `channels` 테이블 컬럼만 사용합니다. Realtime은 이미 활성화된 `channels` 테이블 구독으로 충분합니다.

### 7. UX 디테일

- 노인 친화: 도크 버튼 최소 높이 3rem, 한국어 명확한 라벨
- 라이브 중일 때 페이지를 벗어나도 경과 시간이 계속 카운트(타이머는 도크 마운트와 동일 생명주기)
- 모바일에서는 도크가 BottomNav를 가리지 않도록 `bottom-20` 등 안전 여백
- "라이브 시작/종료"는 항상 확인 다이얼로그 → 실수 방지
- 접근성: `aria-live="polite"`로 상태 변화 스크린리더 안내

### 8. 검증 시나리오

1. 홈에서 도크 "▶ 라이브 시작" → 다이얼로그 → STARTING → AWAITING_INPUT까지 도크에서 진행 표시
2. OBS 송출 → 도크가 빨강 + 경과 시간 카운트 시작
3. 다른 페이지로 이동해도 도크 유지, 경과 시간 끊기지 않음
4. 도크의 "⏹ 종료" → VOD 저장 다이얼로그 → 종료 후 도크가 "▶ 라이브 시작"으로 복귀
5. 채널 설정 페이지에서 종료해도 다른 탭의 도크가 Realtime으로 즉시 갱신
6. 비로그인/채널 없음/미승인 사용자에게는 도크가 보이지 않음
