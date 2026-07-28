## 원인

`src/components/VideoPlayer.tsx` 에서 모든 소스 타입을 동일하게 `aspect-video`(16:9) 컨테이너 안에 렌더링합니다. Google Drive의 `/preview` iframe은 자체 플레이어 UI(상단 툴바 + 하단 재생/일시정지/타임라인)를 iframe 내부에서 렌더링하는데, iframe 높이가 부족하면:

- 상단 진행바만 보이고 하단 재생/일시정지 컨트롤은 잘림
- 실제 영상은 letterbox 되어 어둡게 표시

첨부 스크린샷이 정확히 이 증상입니다(상단에 진행바+팝아웃 아이콘만 보이고 재생 버튼 없음).

Native `<video>`/HLS/YouTube 임베드는 정상 동작하므로 **Google Drive 케이스에만 국한된 문제**입니다.

## 해결 방향

`VideoPlayer` 안에서 Google Drive 소스일 때만 컨테이너 처리를 분리합니다.

1. **Google Drive 전용 wrapper 분리**
   - 공통 `aspect-video` 컨테이너 대신 Drive iframe은 별도 wrapper로 감쌈
   - Drive 플레이어 컨트롤 여유 공간을 확보하기 위해 `aspect-video` 대신 `aspect-[16/10]` 또는 영상 영역 아래 컨트롤 스트립용 여백을 두는 방식 사용
   - 모바일에서 확실히 컨트롤이 노출되도록 최소 높이(`min-h-[260px]` 정도) 지정

2. **iframe 속성 보강**
   - `allow="autoplay; encrypted-media; fullscreen; picture-in-picture"` (fullscreen 추가)
   - `allowFullScreen` 유지
   - `title` 을 원본 컨텐츠와 연결

3. **재생 실패/비공개 파일 대응 안내**
   - 이번 리퀘스트 범위(비율/컨트롤 문제)에서 벗어나지 않도록 별도 안내 UI 추가는 하지 않음
   - 대신 상단 우측에 "새 창에서 열기" 링크 하나만 노출(Drive의 팝아웃 아이콘이 잘리는 상황에서 유저의 fallback 제공)

## 기술 세부 (변경 파일)

**`src/components/VideoPlayer.tsx`** 만 수정:

- `isIframe` 분기 안에서 `source.type === 'google-drive'` 를 별도 브랜치로 분리
- YouTube 임베드는 지금처럼 `aspect-video` 그대로 유지 (문제 없음)
- Google Drive 브랜치:
  ```
  <div className="relative w-full aspect-[16/10] min-h-[260px] bg-black rounded-xl overflow-hidden">
    <iframe
      src={embedUrl}
      className="absolute inset-0 w-full h-full border-none"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
    />
    <a
      href={originalDriveUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute top-2 right-2 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded"
    >새 창에서 열기</a>
  </div>
  ```
- `parseVideoSource` 반환 타입에 `originalUrl` 을 함께 담아 "새 창에서 열기" 링크가 원본 Drive URL을 가리키도록 함

## 검증

- 프리뷰에서 첨부된 VOD 페이지(`2026 청년찬양제`) 로드 → iframe 하단에 재생/일시정지·타임라인·볼륨·풀스크린 컨트롤이 완전히 노출되는지 확인
- YouTube 임베드/HLS 라이브/직접 mp4 는 회귀 없이 기존대로 16:9 유지되는지 확인
- 모바일(384px) 뷰포트에서 컨트롤 잘림 없는지 확인

## 범위 밖 (건드리지 않음)

- 백엔드/DB/edge function
- YouTube / HLS / 직접 mp4 플레이어 로직
- 업로드 시 Drive 공유 권한 검사 UX (별건)
