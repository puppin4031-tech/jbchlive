# 커스텀 도메인 접속 설정 가이드

## 왜 지금 안 되고 있는지

Cloudflare에 넣으려던 값이 `jbchlive.lovable.app`이었다면 절대 등록이 안 됩니다. 이유:

- `.lovable.app`은 **Lovable 소유의 도메인**입니다. Cloudflare는 "당신이 소유권을 증명할 수 있는 루트 도메인"만 받아들입니다.
- 즉 Cloudflare에는 반드시 **내가 직접 구매한 루트 도메인**(예: `pajujbch.org`, `mychurch.com`)을 넣어야 합니다.
- Lovable 주소는 그대로 살아있으면서, 그 위에 "별칭"으로 커스텀 도메인을 얹는 구조입니다.

```text
사용자 브라우저
      │  www.mychurch.com 입력
      ▼
Cloudflare DNS (내 도메인 관리)
      │  A 레코드 → 185.158.133.1
      ▼
Lovable 호스팅 (jbchlive.lovable.app 내용을 서빙)
```

두 주소 모두 동일한 사이트를 엽니다. `jbchlive.lovable.app`은 자동으로 커스텀 도메인으로 리다이렉트되도록 설정 가능합니다.

## 진행 절차

### 1단계 — 도메인 확보 (택 1)

**옵션 A: Lovable에서 바로 구매 (가장 간단, 권장)**
- Project Settings → Project → Domains → **Buy new domain**
- 원하는 이름 검색 → 결제 → 자동으로 프로젝트에 연결됨
- Cloudflare 설정 불필요, DNS도 Lovable UI에서 관리

**옵션 B: 이미 산 도메인이 있거나, Cloudflare Registrar에서 새로 구매**
- 도메인을 먼저 확보한 뒤 2단계로

### 2단계 — Cloudflare에서 도메인 등록 (옵션 B인 경우만)
1. Cloudflare 계정 → **Add a Site** → 내 루트 도메인 입력 (예: `mychurch.com`, `www` 붙이지 않음)
2. Free 플랜 선택
3. Cloudflare가 보여주는 2개의 네임서버(NS)를 도메인 등록업체(가비아, 후이즈 등)의 네임서버 설정에 입력
4. 전파 완료(수 분~수 시간) 대기 → Cloudflare 대시보드에 "Active" 표시

### 3단계 — Lovable에서 Connect Domain
1. Project Settings → Project → Domains → **Connect Domain**
2. 도메인 입력: `mychurch.com` (프로토콜/슬래시 없이, 소문자)
3. **Advanced 펼치기 → "Domain uses Cloudflare or a similar proxy" 체크**
4. Lovable이 CNAME + TXT 값 제공 → 다음 단계에서 사용
5. `www` 서브도메인도 원한다면 별도로 한 번 더 Connect (`www.mychurch.com`)

### 4단계 — Cloudflare DNS 레코드 추가
Cloudflare 대시보드 → 해당 도메인 → **DNS → Records → Add record**

```text
Type: CNAME  Name: @    Target: <Lovable이 준 CNAME 값>   Proxy: ON (주황 구름)
Type: CNAME  Name: www  Target: <Lovable이 준 CNAME 값>   Proxy: ON
Type: TXT    Name: _lovable   Content: lovable_verify=<Lovable이 준 값>   Proxy: DNS only
```

주의사항:
- 기존에 다른 A/AAAA/CNAME 레코드가 `@` 또는 `www`에 있으면 **먼저 삭제**
- Cloudflare **SSL/TLS 모드는 반드시 "Full" 이상** (Flexible이면 리다이렉트 루프 발생)
- CAA 레코드가 있다면 Let's Encrypt 허용

### 5단계 — Lovable에서 Verify
- Lovable Domains 화면 → **Verify** 클릭
- 상태 흐름: `Verifying` → `Setting up` → `Active` (SSL 자동 발급)
- 최대 72시간 걸리지만 보통 5~30분

## 자주 걸리는 함정

| 증상 | 원인 | 해결 |
|------|------|------|
| "도메인이 잘못됨" | `.lovable.app`을 입력함 | 내 소유 루트 도메인 사용 |
| Verify 실패 | Cloudflare 프록시 ON인데 Advanced 옵션 미체크 | Advanced에서 프록시 옵션 체크 |
| 리다이렉트 루프 | Cloudflare SSL/TLS = Flexible | Full로 변경 |
| `www`만 열림 or `@`만 열림 | 한쪽만 Connect 함 | 양쪽 모두 Connect + DNS 등록 |
| DNS 전파 안 됨 | 등록업체 NS 변경 미완료 | https://dnschecker.org 로 NS 확인 |

## 이 계획에는 코드 변경 없음
전부 인프라(도메인/DNS) 설정 작업입니다. 앱 코드 수정 불필요, 방송 송출 핵심 경로에도 영향 없음.

## 다음 액션이 필요합니다
어떤 도메인을 쓰실 건지 알려주세요:
1. **Lovable에서 새로 구매**할지 (옵션 A)
2. **이미 소유한 도메인 이름**이 무엇인지, 그리고 그게 이미 Cloudflare에 등록되어 있는지 (옵션 B)

답을 주시면 그 상황에 맞춰 위 단계 중 남은 부분을 세부적으로 안내드립니다.
