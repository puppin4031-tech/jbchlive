# 라이브 자동종료가 전혀 동작하지 않는 원인과 수정

## 확인된 원인 (실측)

자동종료·OBS 끊김 알림을 담당하는 워치독(`autoStopIdleChannels`)은 30초마다 정상 실행되고 있지만, **호출이 매번 401 Unauthorized로 거부**되고 있습니다.

- 스케줄러 실행 기록: 30초마다 `succeeded`
- 실제 HTTP 응답 기록: 전부 `401 {"error":"Unauthorized"}`
- 원인: 스케줄러가 인증 헤더 값을 금고(vault)에서 읽어오는데 **금고가 비어 있음**(등록된 시크릿 0건) → 헤더가 비어서 전송 → 함수가 거부

즉 3중 안전장치(OBS 끊김 감지, 저시청자 종료, 최대시간 종료) 코드는 존재하지만 **단 한 번도 실행되지 않았습니다.** OBS를 5분 껐는데도 알림/종료가 없었던 것, 송출자 브라우저를 닫아도 3분 후 조치가 없던 것 모두 같은 원인입니다.

## 수정 내용

### 1) 워치독 인증 복구
- 전용 크론 시크릿(`CRON_SECRET`)을 생성해 백엔드 함수 시크릿으로 등록
- 동일 값을 금고에 저장하고, 4개 스케줄 작업(`autoStopIdleChannels`, `scheduledStartChannels`, `scheduledStopChannels`, `sampleLiveViewers`)의 호출 명령을 새 시크릿을 읽도록 재생성
- 함수 측 검증을 `CRON_SECRET` 우선, 기존 키는 하위호환으로 허용
- 적용 후 실제 응답 코드가 200으로 바뀌는지 직접 확인

### 2) 하드 캡 기준값 변경 (요청 반영)
| 항목 | 현재 | 변경 |
|---|---|---|
| 최대 방송 시간 | 300분 | **180분** |
| 저시청자 강제종료 유지 시간 | 50분 | **20분** |
| 저시청자 기준 | 2명 이하 | **1명 이하** |

`channels.auto_stop_max_minutes` 기본값도 180분으로 정리하고, 기존 채널 값도 180으로 맞춥니다.

### 3) 동작 검증
현재 라이브 중인 채널(파주교회, OBS 종료 상태)에 대해 워치독을 수동 1회 실행하여
OBS 끊김 알림 → 1분 유예 → 자동 종료까지 실제로 이어지는지 확인합니다.

## 기술 메모
- 대상 파일: `supabase/functions/live-stream/index.ts` (크론 인증 블록, `HARD_MAX_MINUTES`, `LOW_VIEWER_MAX_MINUTES`, `HARD_LOW_VIEWER_THRESHOLD`)
- 마이그레이션: 금고 시크릿 등록 + `cron.job` 재등록 + `auto_stop_max_minutes` 기본값 변경
- 송출/시작 경로(`startChannel`, 프로비저닝) 코드는 건드리지 않습니다.
