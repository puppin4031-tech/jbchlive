# 사이트 첫 진입 속도 개선

## 확인한 현상 (실측)

로컬 프리뷰에서 홈(`/`) 진입을 측정한 결과:

- 초기 JS가 **한 덩어리로 전부** 로드됨 — 24개 페이지 전부(관리자, 커뮤니티, 방송 관리 등)와 `hls.js`(약 1MB), 아이콘 라이브러리 전체가 홈에서도 즉시 다운로드됨. `App.tsx`에 모든 페이지가 정적 import 되어 있고 `React.lazy`가 전혀 없음.
- 홈 진입 4초 안에 **같은 DB 요청이 5~6번씩 반복** 호출됨 (`channels?is_live=true` 5회, `sermons ...` 6회). 원인은 `Index.tsx`의 Realtime 구독이 `channels` 테이블의 **모든 UPDATE**마다 3개 쿼리를 무효화하기 때문. 라이브 중에는 `current_viewers`가 주기적으로 갱신되므로 그때마다 홈 전체가 다시 조회됨.
- 홈 쿼리 5개 중 2개(`vod-sermons-home`, `channels-home`)에는 `staleTime`이 없어 화면 진입/재마운트마다 재조회.
- 목록 쿼리가 `select('*')` — 필요 없는 컬럼(스트림 설정, 타임아웃 값 등)까지 매번 전송.
- 썸네일이 Google Drive 원본 URL(`sz=w1920`)로 로드되고 `loading="lazy"`가 없음.

## 개선 작업

1. **라우트 코드 스플리팅**
   - `App.tsx`의 페이지 import를 `React.lazy` + `Suspense`로 전환. 홈 진입 시 관리자/커뮤니티/방송관리 코드가 내려오지 않도록.
   - `hls.js`를 `VideoPlayer`에서 동적 `import()`로 변경 — 실제 라이브 재생 시점에만 로드.

2. **홈 요청 폭주 제거**
   - Realtime 핸들러에서 `is_live` 값이 실제로 바뀐 경우에만 쿼리 무효화. 조회수/시청자수 변경 UPDATE는 무시.
   - 무효화 자체에 짧은 디바운스(예: 1초)를 걸어 연속 이벤트를 1회로 합침.
   - `vod-sermons-home`, `channels-home`에도 `staleTime: 60_000`, `refetchOnWindowFocus: false` 적용.
   - `live-channels`와 `all-approved-channels`는 데이터가 겹치므로 하나로 합쳐 요청 수를 줄임.

3. **쿼리 슬림화**
   - 홈에서 쓰는 컬럼만 명시적으로 select (채널: id, name, logo_url, is_live, subscriber_count / 설교: id, title, preacher, category, thumbnail_url, sermon_date, view_count, is_live, duration, channel_id).

4. **이미지 로딩**
   - 카드 썸네일/로고에 `loading="lazy"`, `decoding="async"`, 명시적 width/height 추가. Drive 썸네일은 `sz=w1920` 대신 카드 크기에 맞는 값으로 요청.

## 기술 메모

- 백엔드(DB/Edge Function) 로직은 건드리지 않음. 프론트엔드 로딩·캐싱 계층만 수정.
- 수정 후 동일한 방식으로 재측정하여 초기 JS 용량과 홈 진입 시 요청 수를 비교해 보고.
