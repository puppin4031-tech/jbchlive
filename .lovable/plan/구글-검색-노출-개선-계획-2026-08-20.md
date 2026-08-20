# 구글 검색 노출 개선 계획

## 현재 상태 (확인된 사실)

- 이 프로젝트에는 Google Search Console 연결이 없습니다. 즉, 실제 색인 여부·검색 노출 데이터를 확인할 수 있는 근거가 지금은 없습니다(노출이 0이라는 증거도, 색인됐다는 증거도 없음).
- `public/sitemap.xml` 파일이 없습니다. 크롤러에게 알려줄 페이지 목록이 없습니다.
- `public/robots.txt`는 모든 크롤러 허용 상태이며, `Sitemap:` 항목이 없습니다.
- `index.html`의 title/description은 사이트 전체에 하나뿐입니다. 라이브/설교/커뮤니티 등 개별 페이지가 각자의 제목·설명을 갖고 있지 않습니다(react-helmet 등 미사용).
- og:image가 만료 파라미터가 붙은 임시 업로드 URL을 가리키고 있습니다.

검색에 안 나오는 흔한 원인은 (1) 아직 구글이 사이트를 발견/색인하지 못함, (2) 페이지별 정보 부족입니다. 지금 상태는 두 가지 모두에 해당합니다.

## 할 일

### 1. Google Search Console 연결 및 사이트 소유 확인
- Search Console 커넥터를 연결하고, `https://jbchlive.lovable.app/` 를 URL-접두어 속성으로 등록합니다.
- 소유 확인용 메타 태그를 `index.html` `<head>`에 넣고, 게시(publish) 후 확인 절차를 진행합니다.
- 확인 완료 후 사이트맵을 제출하고, 실제 색인 상태를 조회해 알려드립니다.

### 2. sitemap.xml 생성
- `public/sitemap.xml`에 공개 경로(홈, 라이브 목록, 커뮤니티, 요금제, 검색 등)를 등록합니다.
- `robots.txt`에 `Sitemap: https://jbchlive.lovable.app/sitemap.xml` 한 줄 추가.

### 3. 페이지별 메타데이터
- `react-helmet-async`를 도입해 주요 페이지(홈, 라이브, 설교 상세, 채널, 커뮤니티, 요금제)마다 고유한 title / description / canonical / og 태그를 설정합니다.
- 설교·채널 상세는 실제 제목과 설명을 그대로 사용합니다.

### 4. 구조화 데이터 및 기본 정리
- 홈에 Organization JSON-LD, 설교 상세에 VideoObject JSON-LD 추가.
- 만료되는 og:image URL을 프로젝트 내 정적 이미지로 교체.
- 각 페이지 H1 1개 원칙 점검, 이미지 alt 확인.

## 기술 메모

- SPA라 크롤러가 JS 렌더링 후에야 내용을 봅니다. 구글은 렌더링을 하지만 지연이 있으므로, `index.html`의 기본 title/description을 의미 있게 유지하는 것이 중요합니다.
- 사이트맵의 URL은 공개 경로만 포함합니다(관리자·마이채널·로그인 등 제외).
- 검색 반영에는 보통 며칠~2주가 걸립니다. 오늘 작업해도 즉시 노출되지는 않습니다.
