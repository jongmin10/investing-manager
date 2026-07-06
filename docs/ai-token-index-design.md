# 기능 설계: SDLLMTK (LLM 토큰 지출 지수) 대시보드 추가

> 작성: javis (PM 오케스트레이터) · 2026-07-06 · 상태: 구현 완료
> 한 줄 요약: Silicon Data의 LLM 토큰 지출 지수(SDLLMTK)를 대시보드에 추가해, AI 실수요(추론 토큰 지출)를 AI 인프라 투자 테마의 수요 확인 지표로 활용한다.

---

## 1. 배경 및 목적

### 1.1 SDLLMTK란?

**LLM Token Expenditure Index (Bloomberg: SDLLMTK)** — Silicon Data가 매 거래일 발행하는 지수.
- **측정값**: 전체 시장이 LLM 추론에 지불하는 지출 가중 평균 가격 (USD/100만 토큰)
- **방법론**: 사용량(spend) 가중 평균. 신규 모델은 14일 trailing spend 창에서 점유율을 쌓아야 반영 — 헤드라인 가격 발표가 아닌 **실제 지출 기반**
- **대상**: Frontier API 사업자(OpenAI·Anthropic·Google) + 오픈웨이트 추론 플랫폼 + 전용 인스턴스 브로커 + 자체호스팅 참조 배포까지 커버
- **세그먼트**:
  | 세그먼트 | 2026-04-22 기준값 | 성격 |
  |---------|-----------------|------|
  | Frontier | $4.20 / 100만 토큰 | GPT-4o·Claude·Gemini 급 모델 |
  | Open-weight | $0.85 / 100만 토큰 | Llama·Mistral 급 오픈소스 모델 |
  | **Blended (SDLLMTK)** | **$1.62 / 100만 토큰** (2026-07-03) | 통합 지수 |

### 1.2 왜 투자 지표로 의미 있는가?

- **AI 실수요 프록시**: 데이터센터 Capex는 공급 측, SDLLMTK는 **수요 측** 시그널 — "AI 인프라 투자가 실제로 쓰이고 있는가"를 확인
- **인프라 투자 선행 검증**: SDLLMTK 상승 → 추론 수요 증가 → 데이터센터 전력·GPU 수요 증가로 이어지는 인과 체인 가시화
- **실제 흐름**: 5개월 만에 76% 상승 후 최근 하락 전환 → AI 인프라 투자 사이클의 변곡점 포착 가능
- 기존 대시보드의 **SOX(반도체 지수)·DC Capex·전력 수요**와 연계해 교차 분석하면 투자 의사결정에 실질적 부가가치

---

## 2. 요구사항 정의

### 2.1 표시 지표

| # | 지표 | 단위 | 설명 |
|---|------|------|------|
| 1 | SDLLMTK Blended | USD/100만 토큰 | 전체 시장 통합 지수 |
| 2 | Frontier 세그먼트 | USD/100만 토큰 | GPT-4o·Claude·Gemini 급 |
| 3 | Open-weight 세그먼트 | USD/100만 토큰 | Llama·Mistral 급 |
| 4 | Frontier/Open-weight 스프레드 | USD | Frontier − Open-weight (격차) |
| 5 | 전일 대비 등락 (Blended) | % | 모멘텀 방향 확인 |

> **우선순위**: Blended + 전일 등락이 핵심. 세그먼트·스프레드는 상세 뷰.

### 2.2 트렌드 차트

- 최근 90일 Blended 지수 일별 시계열 (라인 차트, Recharts 기존 패턴)
- 선택적: Frontier / Open-weight 두 선을 함께 표시해 스프레드 시각화

### 2.3 UX 배치

- **위치**: 대시보드 > "데이터센터" 탭 내 `AI 실수요 지수 (SDLLMTK)` 섹션
  - DC Capex 차트 **아래**에 배치 — "공급 투자 → 실수요 확인" 흐름으로 읽힘
- **형식**: 요약 카드(Blended·Frontier·Open-weight·스프레드) + 90일 트렌드 차트
- **업데이트 주기**: 일 1회 (기존 daily cron 연동), 거래일 기준

### 2.4 이상 신호 하이라이트

| 조건 | 표시 |
|------|------|
| 전일 대비 ±10% 초과 변동 | 카드 테두리 주황색 |
| 스프레드(Frontier−OW)가 $5 초과 | 툴팁 "Frontier 프리미엄 과도" 경고 |

---

## 3. 데이터 소스 분석

### 3.1 Silicon Data API (채택 검토)

| 항목 | 내용 |
|------|------|
| 제공사 | Silicon Data (silicondata.com) |
| 포털 | portal.silicondata.com |
| API 문서 | docs.silicondata.com/products/api-overview |
| 무료 플랜 | 컴플리멘터리 계정 제공(한시적) — 가입 후 접근 가능 |
| Bloomberg ticker | SDLLMTK |
| 발행 주기 | 매 거래일 |

> **[액션 — 구현 전 필수]**: Silicon Data 계정 등록 및 API 키 발급 확인 필요.
> 무료 API 엔드포인트 형식, 인증 방식(키 헤더 vs OAuth), rate limit을 문서에서 검증해야 함.

### 3.2 Silicon Data API 예상 호출 패턴 (미검증 — 문서 확인 후 확정)

```
# 예상: 최신값 조회
GET https://api.silicondata.com/v1/indices/SDLLMTK/latest
  → { blended, frontier, openWeight, recordedAt }

# 예상: 이력 조회 (90일 차트용)
GET https://api.silicondata.com/v1/indices/SDLLMTK/history?days=90
  → [{ date, blended, frontier, openWeight }, ...]
```

> **주의**: 위 엔드포인트는 추정값. 실제 문서(`docs.silicondata.com`)에서 정확한 경로 확인 필수.

### 3.3 API 접근 불가 시 대안

| 대안 | 방법 | 한계 |
|------|------|------|
| 포털 스크래핑 | `portal.silicondata.com/token-index-chart` HTML 파싱 | ToS 위반 위험, 구조 변경 취약 |
| 수동 입력 | 관리자 `/admin` 페이지에서 일별 수동 등록 | 자동화 불가, 운영 부담 |
| Bloomberg API | BBG Data API (SDLLMTK) | 유료, 개인 투자자 비용 과다 |

→ **Silicon Data API 정식 접근이 유일한 실용적 경로**. API 접근 불가 시 수동 입력 fallback으로 MVP 구성 가능.

---

## 4. 스키마 설계

### 4.1 신규 모델: `AiTokenRecord`

기존 `IndicatorRecord`(단일 Float 저장)로는 Blended/Frontier/Open-weight 3개 값을 수용 불가 → 신규 모델 추가.

```prisma
model AiTokenRecord {
  id              Int      @id @default(autoincrement())
  blended         Float    // USD/100만 토큰 (SDLLMTK 대표값)
  frontier        Float?   // Frontier 세그먼트
  openWeight      Float?   // Open-weight 세그먼트
  recordedAt      DateTime @default(now())

  @@index([recordedAt(sort: Desc)])
}
```

**설계 결정**:
- 세그먼트를 별도 행 대신 같은 행에 컬럼으로 저장 → 날짜별 1행, 쿼리 단순
- 90일 이력 = 최대 90행 → 경량, 대용량 이슈 없음
- `prisma db push`로 반영 (마이그레이션 없음, CLAUDE.md 지침)

---

## 5. API 설계

### 5.1 수집 엔드포인트

```
POST /api/ai-tokens/collect
```

- **인증**: `Authorization: Bearer ${CRON_SECRET}` (기존 cron 패턴 동일)
- **처리 흐름**:
  1. Silicon Data API 호출 → `{ blended, frontier, openWeight }` 취득
  2. `AiTokenRecord` insert (당일 중복 방지: `recordedAt::date` 기준 upsert)
  3. 응답: `{ inserted: 1, date: "2026-07-06" }`
- **실패 처리**: API 오류 시 `503` 반환, cron 로그에 기록, 기존값 유지(삭제 안 함)

### 5.2 조회 엔드포인트

```
GET /api/ai-tokens
```

**응답 구조**:
```typescript
{
  latest: {
    blended: number;        // 최신 blended (SDLLMTK)
    frontier: number | null;
    openWeight: number | null;
    spread: number | null;  // frontier - openWeight
    change1d: number | null; // 전일 대비 % 변화 (blended 기준)
    recordedAt: string;
  };
  history: Array<{          // 최근 90일 일별 시계열 (차트용)
    date: string;           // "2026-07-06"
    blended: number;
    frontier: number | null;
    openWeight: number | null;
  }>;
}
```

- **캐싱**: `unstable_cache` 300초 (대시보드 기존 패턴 동일)
- **히스토리 초기 부족 시**: `history` 배열에 수집된 만큼만 반환 (빈 배열 허용), UI에서 데이터 부족 안내

### 5.3 Cron 연동

`vercel.json` daily cron (`/api/cron/daily`) 내 슬라이스에 추가:

```json
{ "path": "/api/ai-tokens/collect", "tag": "ai-tokens" }
```

60초 maxDuration 안에 단일 외부 API 1건이므로 슬라이스 분리 불필요.

---

## 6. UI/UX 설계

### 6.1 컴포넌트 구조

```
src/components/datacenter/
  AiTokenIndex.tsx       ← 신규: 요약 카드 + 트렌드 차트 통합
```

기존 `DataCenterUS.tsx`에 `<AiTokenIndex />` 마운트 (DC Capex 섹션 아래).

### 6.2 레이아웃 스케치

```
┌─────────────────────────────────────────────────────────┐
│  AI 실수요 지수 (SDLLMTK)        최근 수집: 2026-07-06   │
├──────────────┬────────────┬────────────┬────────────────┤
│ SDLLMTK     │ Frontier   │ Open-wt    │ 스프레드       │
│ $1.62/1M    │ $4.20/1M   │ $0.85/1M   │ $3.35         │
│ ▼ -2.4% (1d)│            │            │               │
└──────────────┴────────────┴────────────┴────────────────┘

   [90일 트렌드 차트 — Recharts LineChart]
   ┌──────────────────────────────────────────────────┐
   │ $2.5 ─ ╭─╮                                       │
   │ $2.0 ─ │  ╰─╮   ╭──                              │
   │ $1.5 ─ │    ╰───╯                                 │
   │ $1.0 ─ ┼────────────────────────→ 날짜            │
   └──────────────────────────────────────────────────┘
    Blended ── Frontier ── Open-weight (3선 선택 표시)
```

### 6.3 모바일 처리

- 요약 카드: 2×2 그리드 (`grid-cols-2`) — 스프레드 카드는 하단으로 이동
- 차트: Frontier/Open-weight 선 기본 숨김, 토글 버튼으로 표시 (모바일 가독성)
- 단위 축약: "USD/1M tok" → 모바일에서는 "/1M"으로 단축

### 6.4 툴팁

카드 제목 옆 `?` 아이콘 클릭 시:
> "LLM 토큰 지출 지수(SDLLMTK)는 전체 시장이 AI 추론(LLM 사용)에 실제로 지불하는 단가의 가중 평균입니다. 지수 상승은 AI 실수요 증가 또는 고성능 모델 선호도 상승을 의미합니다. (출처: Silicon Data)"

---

## 7. 이력 초기 수집 (Historical Backfill)

Silicon Data API가 이력 조회를 지원하는 경우:
- 최초 수집 시 90일치 이력을 일괄 insert → 차트 즉시 활성화
- 스크립트: `scripts/backfill-ai-tokens.mjs` (기존 backfill 패턴 참조)

API가 이력 미지원 시:
- cron이 일별로 쌓이는 방식으로만 진행 — 90일 차트는 약 3개월 후 완성
- 그 전까지는 "수집 중 (N일 누적)" 메시지 표시

---

## 8. 구현 계획

| # | 작업 | 담당 에이전트 | 규모 | 선행 조건 |
|---|------|------------|------|---------|
| 0 | Silicon Data 계정 등록 + API 키 발급 | **사용자 직접** | — | **임계경로** |
| 1 | `SILICONDATA_API_KEY` Vercel 환경변수 등록 | 사용자 직접 | — | #0 완료 후 |
| 2 | API 엔드포인트 형식 문서 확인 → 설계서 §3.2 확정 | super | XS | #0 완료 후 |
| 3 | `AiTokenRecord` Prisma 스키마 추가 + `db push` | super | S | |
| 4 | `POST /api/ai-tokens/collect` 구현 | super | M | #2, #3 |
| 5 | `GET /api/ai-tokens` 구현 | super | S | #3 |
| 6 | cron daily에 수집 체이닝 추가 | super | XS | #4 |
| 7 | 이력 백필 스크립트 (API 지원 시) | super | S | #2, #3 |
| 8 | `AiTokenIndex.tsx` 컴포넌트 구현 | wonder | M | #5 |
| 9 | `DataCenterUS.tsx`에 마운트 | wonder | XS | #8 |
| 10 | Playwright 검증 (데스크톱 + Pixel 5) | sam | S | #9 |

---

## 9. 미결 사항 / 의사결정 필요

| 항목 | 옵션 A | 옵션 B | 현재 추천 |
|------|--------|--------|---------|
| API 접근 | Silicon Data 정식 API | 수동 입력 fallback | **A** 우선, 실패 시 B로 MVP |
| 차트 세그먼트 | Blended 1선만 | Blended+Frontier+OW 3선 | **A** (첫 버전 단순화) |
| 이상 신호 임계값 | ±10% / 스프레드 $5 | 사용자 설정 | **A** (하드코딩, 오버엔지니어링 방지) |
| 원화 환산 | USD만 표시 | USD + KRW 병행 | **A** (단위가 "$/100만 토큰"이라 KRW 환산 직관성 낮음) |

---

## 10. 환경변수

| 변수명 | 발급처 | 비고 |
|--------|--------|------|
| `SILICONDATA_API_KEY` | silicondata.com (가입 후 발급) | 무료 컴플리멘터리 계정 |

---

## 참고 링크

- [SDLLMTK 공식 페이지](https://www.silicondata.com/products/silicon-index/llm-token-expenditure-index)
- [실시간 차트 포털](https://portal.silicondata.com/token-index-chart)
- [Silicon Data API 문서](https://docs.silicondata.com/products/api-overview)
