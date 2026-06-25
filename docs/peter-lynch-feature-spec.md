# 피터 린치 종목분석 기능 — 개발규격 (통합)

작성: javis(PM) 통합 · super(백엔드) + wonder(프론트) 작성 · 작성일 2026-06-24
상태: **설계 확정 단계 / 구현 보류(코딩은 추후)**
근거 정책: `docs/peter lynch invest.txt`

---

## 0. 기능 개요

사용자가 **한국 종목코드(6자리)**를 입력하면, 피터 린치의 *One Up on Wall Street* / *Beating the Street* 6단계 프레임워크로 종목을 평가해 구조화된 결과를 보여준다. 정형 재무수치는 **코드가 DB에서 채우고**, 정성 판단(분류 근거·2분 드릴·플래그·결론·검증질문)은 **LLM(OpenRouter `google/gemini-2.5-flash`, 기존 시황 리포트 연동 재사용)**이 생성하는 **하이브리드** 구조.

**6단계:** ① Six Categories 분류 → ② 7개 핵심지표 체크리스트 → ③ Two-Minute Drill(4문장) → ④ Green/Red Flags → ⑤ 매수/홀드/매도 결론 → ⑥ 검증 질문.

**정책 규칙(필수 준수):** 모든 숫자 출처표기 · 추정치 "추정" 명시 · 데이터 없으면 **"공시에서 확인 불가"**(면책문구 금지).

---

## 1. ★ PM 결정사항 (구현 전 사용자 확정 필요)

| # | 쟁점 | 결정 | 상태 |
|---|------|------|------|
| D1 | **인증/비용통제** — 분석마다 OpenRouter 토큰 비용 발생 | **로그인 사용자 한정** (NextAuth 세션 필수, 비로그인 401) | ✅ 확정(2026-06-24) |
| D2 | **데이터 GAP** — 2단계 7지표 중 **5개가 현재 미수집** | MVP는 "확인 불가"로 정직 표기, D/E·현금/시총은 Phase 2 저비용 보강 | ✅ 확정 |
| D3 | **스코프** — 미국 티커(정책 예시 IRMD) | **한국 6자리 코드만**, 미국은 별도 과제 | ✅ 확정(2026-06-24) |
| D4 | **MVP 범위** — 신규 수집기 0으로 시작 | 모델1 + 라이브러리1 + 라우트1 + 페이지1 | ✅ 확정 |

---

## 2. 데이터 소싱 매핑 (★ 핵심 — GAP 분석)

분류: **[조달]** 기존 필드 직접 · **[계산]** 가공 · **[GAP]** 현재 소스로 확보 불가
*외부 데이터 가용성은 현 수집 파이프라인 기준 추정.*

### 2단계 7개 핵심 지표

| # | 지표 | 분류 | 조달 / 근거 | MVP 처리 |
|---|------|------|------------|----------|
| 1 | PEG (PER/이익성장률) | **[계산]** | `StockSnapshot.per`(또는 `cnsPer`) ÷ `StockFinancial.netGrowth` | ✅ 산출. 분모 0/음수 → `NA` |
| 2 | Debt-to-Equity | **[GAP]** | 현 DART 수집은 손익+자본총계만, **부채총계 미수집** | "확인 불가" → **Phase 2 저비용 해소** |
| 3 | 현금 / 시총 | **[GAP]** | 시총은 보유, **현금성자산 미수집** | "확인 불가" → **Phase 2** |
| 4 | EPS 3년 CAGR | **[GAP/부분]** | 수집기가 **단년만** upsert, 3년 시계열 부재 | MVP 단년 `netGrowth` 근사 → Phase 2 다년 수집 |
| 5 | 영업이익률 추이 | **[계산/부분]** | `opMargin` 단년 보유, "추이"는 다년 필요 | 당년 `opMargin`+`opGrowth` 방향 근사 |
| 6 | 내부자 매수vs매도(6M) | **[GAP]** | 내부자 거래 소스 없음 | "확인 불가" → Phase 3 |
| 7 | 자사주 매입 추이 | **[GAP]** | 자사주 소스 없음 | "확인 불가" → Phase 3 |

### 1·3·4·5·6단계 입력

| 단계 | 필요 입력 | 조달 |
|------|-----------|------|
| ① 분류 | 매출성장·마진·산업사이클 | `revenueGrowth`,`opMargin`,`opGrowth`(단년)+`sector` / 사이클은 LLM 정성(추정 명시) |
| ③ 2분드릴 | 사업·고객·수익모델·리스크 | DB에 정성 텍스트 없음 → LLM 지식(환각 위험은 ⑥에서 검증 유도) |
| ④ 플래그 | 기관보유율<5%·내부자·자사주·diworsification·고객집중 | GAP 다수 → 해당 플래그 `NA`. "지루한 이름/사업"·"다음 X"는 LLM 정성 |
| ⑤ 결론 | ①~④ 종합 | 코드가 모은 수치+플래그를 컨텍스트로 LLM 추론 |
| ⑥ 질문 | 약한 가정+1차자료 2개 | GAP을 약점으로 지목하도록 LLM 유도 |

---

## 3. 백엔드 규격 (super)

### 3.1 API — 비동기 2-스텝 (LLM 지연·캐시·비용 대응)

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/lynch/[ticker]` | `POST` | 분석 트리거(캐시 히트 시 즉시 반환, 없으면 `pending` 생성 후 생성) |
| `/api/lynch/[ticker]` | `GET` | 결과 폴링 |

- **Next.js 16 주의:** dynamic `params`는 Promise → `{ params }: { params: Promise<{ ticker: string }> }` → `const { ticker } = await params;`
- `export const maxDuration = 60;` · LLM fetch `AbortSignal.timeout(55_000)`
- 중복 트리거 방지: `status:"pending" && updatedAt<3분`이면 무시(DB 기반 인플라이트 락 — 서버리스 모듈 플래그보다 견고)
- `MarketReport`의 `status(pending|done|failed)` 패턴 차용

### 3.2 LLM 연동 (report-generator.ts 재사용)
- `https://openrouter.ai/api/v1/chat/completions`, `google/gemini-2.5-flash`, `Bearer OPENROUTER_API_KEY`, `temperature 0.3`
- **프롬프트 전략(하이브리드):** `peter lynch invest.txt` 전문을 system + "면책금지/확인불가/추정명시/JSON스키마 강제" 규칙. user 메시지에 **코드가 DB에서 뽑은 수치를 '사실'로 주입** + GAP 항목은 "확인 불가로 쓰라"고 명시 → 숫자 환각 차단
- **후처리 방어:** LLM이 GAP 지표에 숫자를 넣으면 코드가 강제로 `value:null, source:"공시에서 확인 불가"`로 덮어쓰기. JSON 추출 실패 시 1회 재시도 후 `failed`

### 3.3 신규 Prisma 모델
```prisma
model LynchAnalysis {
  id              String   @id @default(cuid())
  ticker          String                  // "005930"
  status          String   @default("pending") // pending | done | failed
  result          String?                 // JSON 직렬화 LynchResult
  snapshotDate    DateTime?               // 분석 시점 데이터 출처 추적
  financialPeriod String?                 // "2024A"
  model           String?
  error           String?
  generatedAt     DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([ticker, snapshotDate])        // 데이터 기준 날짜별 캐시
  @@index([ticker])
}
```
- **캐시:** 키 `ticker+snapshotDate(최신 수집일)` → 데이터 갱신 시 자연 무효화(일 1회). 동일일 재요청은 캐시 히트로 비용·지연 절감. `force:true`면 재생성
- 라이브 DB는 Postgres(Supabase) → 신규 모델은 `npx prisma migrate dev` 마이그레이션 필요

### 3.4 에러/엣지

| 케이스 | 처리 | 코드 |
|--------|------|------|
| **비로그인(D1)** | NextAuth 세션 없으면 분석 거부. POST/GET 모두 핸들러 진입 시 세션 검증 | **401** |
| 미지원 종목(Stock 없음) | "지원하지 않는 종목코드" | 404 |
| 미국/비6자리(IRMD) | "현재 한국 종목(6자리)만 지원" | 400 |
| 재무 결측 | 분석 진행, 수치 null+"확인불가", ⑥에서 약점 명시 | 200 |
| 스냅샷 없음 | "데이터 수집 전" | 409 |
| LLM 실패(키없음/타임아웃/파싱) | `status:"failed"`, 격리 | 200(폴링) |
| 입력검증 | `^\d{6}$` 화이트리스트 (인젝션 방지) | 400 |

---

## 4. 프론트 규격 (wonder)

### 4.1 라우트/진입점
- **페이지:** `/screener/lynch` (스크리너 하위 — 종목 유니버스/검색 UX 재사용)
- **사이드바** `Sidebar.tsx`: `/screener` 항목 `children`에 `{ /screener/lynch, 🐢, "린치 분석" }` 추가
- **모바일 네비** `MobileNav.tsx`: `MORE_ITEMS`에 동일 추가(PRIMARY_TABS는 변경 안 함)
- ⚠️ 두 파일 **동시 수정** 필수(한쪽만 하면 데스크톱/모바일 불일치)

### 4.2 티커 입력
- `/api/screener` 200종목 목록 마운트 시 1회 fetch → 클라이언트 메모리 자동완성(2글자+ 전방일치, 최대 8개, ↑↓Enter)
- 인풋은 `type="text"` (종목코드 선행 0 보존 — `type="number"` 금지)
- 유효성: 비숫자/6자리 미만 인라인 에러, 유니버스 미등재는 경고 배지 후 진행 허용

### 4.3 결과 화면 (6섹션)
```
[A] 종목 헤더 카드 — 종목명·코드·시장·섹터 + Six Category 배지(최대2, 비중%)
[B] 7행 체크리스트 표 — 지표/현재값/Lynch기준/판정/코멘트 (모바일 가로스크롤)
[C] Two-Minute Drill — 2x2 카드(모바일 1열)
[D] Green/Red Flags — 2열(모바일 1열), ✓/✗/N/A 아이콘+텍스트
[E] 결론 블록 — bg-blue-600, 매수/홀드/매도 배지 + 사고흐름 단락
[F] 검증 과제 — 약한 가정 + 1차자료 2개
```
- **판정 표현:** 통과 `✓`(emerald) / 실패 `✗`(red) / 확인불가 `—`(gray italic) — **색상만으로 구분 금지, 아이콘+aria-label 병기**(WCAG 1.4.1)
- **카테고리 색상:** SlowGrower=gray, Stalwart=blue, FastGrower=emerald, Cyclical=amber, AssetPlay=violet, Turnaround=orange

### 4.4 로딩/에러/확인불가
- 로딩: 스텝 인디케이터(`[1/4] 데이터 조회…`) + 결과영역 스켈레톤(`animate-pulse`). 30초 `AbortController` 타임아웃
- 에러: 기존 report 패턴 `bg-red-50 border-red-100` + 재시도 버튼
- 초기 상태: 🐢 + "종목코드를 입력하고 분석을 시작하세요"
- **비로그인(D1):** 페이지/입력은 보여주되 분석 시도 시 로그인 안내 — 입력 영역 위 배너 "로그인 후 이용할 수 있습니다 [로그인]"(기존 NextAuth signIn 연결). API 401 응답도 동일 배너로 폴백 처리
- 확인불가 데이터: 표 셀 `—`/gray, 드릴 카드 `bg-gray-50 border-dashed`, 플래그 `N/A` 회색
- **결론 블록 내 인라인 주석**: "AI로 적용한 참고자료, 실제 투자결정에 직접 사용 금지"
- **`<Disclaimer />`는 layout.tsx footer에 전역 삽입돼 있어 별도 추가 불필요**(금융규제 필수 — 제거 금지)

### 4.5 신규 컴포넌트 (`src/components/lynch/`)
`LynchStockHeader` · `LynchChecklist` · `LynchTwoMinuteDrill` · `LynchFlags` · `LynchVerdict` · `LynchValidationQuestions`(이상 Server) · `LynchLoadingState` · `LynchTickerInput`(Client). 페이지 `src/app/screener/lynch/page.tsx`는 Client(요청 상태 관리). **차트 없음**(Recharts 불필요).

---

## 5. ★ 확정 API 계약 (백엔드·프론트 공용 — PM 조정)

super/wonder 간 명명 충돌을 PM이 아래로 통일. **양측 구현은 이 스키마를 단일 출처로 따른다.**

```typescript
// GET/POST /api/lynch/[ticker] 공통 응답
interface LynchResponse {
  ticker: string;            // "005930"
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  status: "pending" | "done" | "failed";
  analyzedAt: string | null; // ISO, done일 때
  result: LynchResult | null;
  dataLimitations: string[]; // 확인불가 항목 라벨 (프론트 경고 표시)
  error?: string;
}

interface LynchResult {
  categories: { type: SixCategory; weightPct: number | null; rationale: string }[]; // 1~2개
  checklist: LynchMetric[];   // 고정 7
  twoMinuteDrill: { whatItSells: string; whosBuying: string; howItMakesMoney: string; biggestRisk: string };
  greenFlags: LynchFlag[];    // 고정 6
  redFlags: LynchFlag[];      // 고정 5
  verdict: { action: "BUY" | "HOLD" | "SELL"; rationale: string };
  validation: { weakestAssumption: string; sources: [string, string] };
}

type SixCategory =
  | "SLOW_GROWER" | "STALWART" | "FAST_GROWER"
  | "CYCLICAL" | "ASSET_PLAY" | "TURNAROUND";   // 프론트가 label/color 매핑

interface LynchMetric {
  key: "PEG" | "DEBT_TO_EQUITY" | "CASH_TO_MCAP" | "EPS_CAGR_3Y"
     | "OP_MARGIN_TREND" | "INSIDER_TRADING" | "BUYBACK_TREND";
  label: string;
  value: string | null;          // 포맷된 문자열 "0.8x" / null=확인불가
  numericValue: number | null;   // 색상·정렬용 원시값
  lynchCriterion: string;
  result: "PASS" | "FAIL" | "CAUTION" | "NA";   // CAUTION = 주의(중간 구간) — 2026-06 품질 튜닝 승인 확장
  comment: string;
  source: string;                // "2024A DART" | "NAVER" | "공시에서 확인 불가"
}

interface LynchFlag { label: string; result: "PASS" | "FAIL" | "CAUTION" | "NA"; comment: string; }
```
**혼합 처리 규칙:** `value:null && result:"NA"` → 프론트 `—`/회색. `twoMinuteDrill` 빈 필드 금지(백엔드가 최소 "(확인 불가)" 채움). 수치는 백엔드가 포맷+원시값 둘 다 제공.

**`result` 4-state (2026-06 품질 튜닝 확장):** `PASS`(통과)·`FAIL`(실패)·`CAUTION`(주의: 실패는 아니나 이상적도 아닌 중간 구간)·`NA`(확인 불가). 프론트는 CAUTION에 amber(주의) 색상+아이콘을 매핑한다(wonder 디자인 확정). CAUTION이 백엔드 산출로 들어가는 지표: **PEG**(1.0~2.0), **EPS_CAGR_3Y**(0~15%), **OP_MARGIN_TREND**(보합 ±0.5%p), **DEBT_TO_EQUITY**(0.5~1.0; >1.0은 FAIL). 플래그(greenFlags/redFlags)도 result 유니온은 동일하나 현재 백엔드는 내부자/자사주를 metric 동기화로만 채우고, 나머지는 LLM이 PASS/FAIL/CAUTION/NA로 응답 가능.

### 5-1. 모델 선택 계약 (2026-06)

**단일 출처:** `src/lib/lynch-models.ts` — `LYNCH_MODELS: LynchModelOption[]` (프론트 드롭다운·백엔드 검증 공용 import).

```typescript
interface LynchModelOption { id: string; slug: string; label: string; isDefault: boolean; }
// allowlist (id = API 파라미터/DB 저장값, slug = OpenRouter model)
//  claude-haiku-4-5   → anthropic/claude-haiku-4.5   (isDefault: true, 기본)
//  claude-sonnet-4-6  → anthropic/claude-sonnet-4.6
//  gemini-2-5-flash   → google/gemini-2.5-flash
export const DEFAULT_LYNCH_MODEL = LYNCH_MODELS.find(m => m.isDefault)!; // = claude-haiku-4-5
export function resolveLynchModel(id?: string | null): LynchModelOption; // 무효/없음 → 기본 폴백
```

**POST `/api/lynch/[ticker]` 요청 body:** `{ force?: boolean; model?: string }` — `model`은 allowlist의 `id`. body 우선, 없으면 query `?model=`. 무효/누락 시 기본(`claude-haiku-4-5`)으로 폴백. 드롭다운 기본 선택값 = `DEFAULT_LYNCH_MODEL.id`.

**캐시 키 & 모델:** DB unique는 `[ticker, snapshotDate]` 단일 행(변경 없음, 마이그레이션 불필요). 단, **done 캐시 히트 재사용 판정에 모델을 포함** — 직전 분석의 `LynchAnalysis.model`이 요청 모델과 다르면 캐시 미스로 간주하고 재실행(행 덮어쓰기). 따라서 모델을 바꿔 재요청하면 해당 모델로 새 분석이 수행된다.

---

## 6. 단계적 구현 (Phasing)

**Phase 1 — MVP (신규 수집기 0):** `LynchAnalysis` 모델 + `src/lib/lynch-analyzer.ts`(report-generator 구조 복제) + `/api/lynch/[ticker]` + `/screener/lynch` 페이지 + 8개 컴포넌트. 산출: PEG(계산)·단년 영업이익률 + ①③④⑤⑥ LLM. GAP 5종 "확인 불가". 한국 6자리만.

**Phase 2 — 재무 GAP 보강(저비용):** `dart-collector.ts`에 BS 파싱 추가(부채총계·자본총계·현금) → `StockFinancial`에 `totalDebt/totalEquity/cash` 필드 → **D/E·현금/시총 해소**. 3개년 재무 루프 → EPS 3년 CAGR·마진 추이 정식화(DART 호출 3배, 기존 배치 정책 준수).

**Phase 3 — 내부자/자사주/기관보유:** DART 자기주식취득처분·임원주요주주 신규 수집기 → ②#6·#7, ④ 플래그 정식화. 미국 티커는 SEC EDGAR 별도 대규모 과제.

---

## 7. 구현 체크리스트 (구현 단계 확인)
- [ ] dynamic route `params` Promise await
- [ ] `maxDuration=60`, LLM fetch `AbortSignal.timeout(55_000)`
- [ ] OpenRouter는 report-generator 패턴(키 없으면 graceful)
- [ ] LLM 숫자 환각 방어(GAP 강제 덮어쓰기)
- [ ] 정책 규칙 system+후처리 이중 적용
- [ ] 신규 모델 Postgres 대상 `prisma migrate dev`
- [ ] 입력 `^\d{6}$`, 미국 티커 400
- [ ] Sidebar+MobileNav 동시 수정
- [ ] 색상+아이콘 병기(WCAG), 표 모바일 가로스크롤, 360~390px 실측
- [ ] `<Disclaimer />` 유지

---

## 부록: 다음 액션
1. **§1의 PM 결정(D1~D4) 확정** → 특히 인증/비용통제(D1)와 스코프(D3)
2. 확정 후 구현 착수 시: super=모델/라이브러리/라우트, wonder=페이지/컴포넌트/네비, 통합 후 sam(QA)
3. 참고: `docs/peter lynch invest.txt`, `src/lib/report-generator.ts`, `src/lib/{stock,dart}-collector.ts`, `prisma/schema.prisma`
