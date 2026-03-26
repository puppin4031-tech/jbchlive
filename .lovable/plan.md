

# 모바일 폰트/버튼 크기 20% 확대 + 퍼블리시

## 요약
모바일(md 미만)에서 폰트와 버튼 크기를 약 20% 키우고, 완료 후 퍼블리시합니다.

## 변경 대상 및 내용

### 1. `src/index.css` — 모바일 기본 폰트 크기 확대
- `body`에 모바일 기본 `font-size: 1.2rem` (md 이상에서는 기본값 복원)

### 2. `src/components/Header.tsx`
- 로고 `w-8 h-8` → `w-10 h-10`
- LIVE 버튼 `text-xs px-3` → `text-sm px-4`
- 아이콘들 `w-5 h-5` → `w-6 h-6`

### 3. `src/components/SermonCard.tsx`
- 제목 `text-sm` → `text-base`
- 메타 텍스트 `text-xs` → `text-sm`
- 아이콘 `w-3 h-3` → `w-4 h-4`
- 채널 로고 `w-8 h-8` → `w-10 h-10`
- LIVE/duration 뱃지 텍스트 `text-xs` → `text-sm`

### 4. `src/components/ChannelCard.tsx`
- 채널명 `text-sm` → `text-base`
- 구독자 수 `text-xs` → `text-sm`
- 구독 버튼 `text-xs` → `text-sm`
- 로고 `w-12 h-12` → `w-14 h-14`

### 5. `src/components/CategoryTabs.tsx`
- 탭 버튼 `text-xs` → `text-sm`

### 6. `src/pages/Index.tsx`
- 섹션 제목 `text-base` → `text-lg`

### 7. `src/pages/LoginPage.tsx`
- 로고 아이콘 `w-12 h-12` → `w-16 h-16`
- 제목 `text-2xl` → `text-3xl`
- 설명/하단 텍스트 크기 확대

### 8. 퍼블리시
- 모든 변경 완료 후 퍼블리시 실행

## 접근 방식
모바일 전용 반응형 클래스(`md:text-sm` 등)를 사용하여 데스크탑 레이아웃에는 영향을 주지 않으면서 모바일에서만 크기를 키웁니다.

