

# VideoPlayer 멀티 플랫폼 지원 확장

## 변경 파일
`src/components/VideoPlayer.tsx` 1개 파일만 수정

## 변경 내용
- `VideoSource` 타입에 `kakao`, `afreeca` 추가
- `parseVideoSource`에 카카오TV, 아프리카TV URL 파싱 로직 추가
- 렌더링부에서 iframe 타입을 배열 체크로 통합 처리
- 사용자가 제공한 코드 구조 그대로 반영

