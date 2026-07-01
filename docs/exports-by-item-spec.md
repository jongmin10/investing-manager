# 기능 설계 검토: "월별 품목별 수출 데이터" 기능

> 작성: javis (PM 오케스트레이터) · 2026-07-01 · **개정 v2: 2026-07-01 (super·wonder·sam 상세검토 반영)** · 상태: **규격서(데이터 소스 실조사 완료, 착수 차단요인 식별, 미구현)**
> 한 줄 요약: 한국의 **월별·품목별 수출 실적**(주요 품목군)을 조회·시각화하는 기능. 관세청 순별(10일 단위) 잠정치로 발표일 즉시 갱신을 지향. 본 문서는 타당성 분석 + 규격서이며 **코딩은 차후**.
>
> **데이터 소스(2026-07-01 실조사) — 2원 소스 조합:**
> - **① 확정 월별 = 관세청 "품목별 수출입실적(GW)" OpenAPI** (data.go.kr/15101609, REST/**XML**, serviceKey, 개발 10,000건/일, 매월 15일경 전월 확정). HS부호 2/4/6/10단위.
> - **② 실시간 순별 = 관세청 "수출 주요품목별 10일 단위 잠정치" OpenAPI** (수입판 15157901만 실확인, **🔴 수출판 존재·ID 미확인**). 1~10일→11일, 1~20일→21일, 월간→익월1일. 주요 ~10품목·잠정.
> - **대안 = KOSIS OpenAPI / K-stat / 관세청 보도자료 파싱**(순별 수출판 부재 시 백업, §3.2).

## 0. 개정 이력 · 리뷰 반영 (v2)

- **v1(초안)** → **v2**: super(백엔드)·wonder(프론트)·sam(QA) 상세검토 결과 반영. 핵심 변화:
  1. **착수 차단(Critical) 재분류**: v1이 "비차단"으로 둔 미지수 중 **(a) 순별 수출 데이터셋 실존, (b) 두 소스 금액 단위(USD vs 천달러), (c) GW XML 태그·네임스페이스·페이지네이션**은 실호출 없이 코드 한 줄도 확정 불가 → **0단계 차단 항목**으로 승격(§7 체크리스트 E1~E8).
  2. **순별 부재 시 백업 플랜** 명문화(§3.2).
  3. **API 응답 계약 보강**: `provisional`·`periodLabel`·`coverage` 필드 추가(프론트 잠정 배지의 데이터 근거) — v1 누락(§5).
  4. **cron 재설계**: 날짜지정 Vercel cron 다수 → **기존 `daily/route.ts` 오케스트레이터에 날짜 가드**로 통합(실제 배포는 단일 daily cron)(§5).
  5. **잠정 YoY 편향 정책**·**순별 누적 처리 계약**·**HS 매핑 커버율/잔여 버킷**·**FOB/CIF**·**N+1 방지**·**Float→정수단위**·**YearMonthSelect extract** 등 반영.

---

## 1. 기능 개요 / 목적

- **목적**: 가용 최초월~현재의 **월별 품목별 수출액**을 표·차트로 보여줘, 어떤 산업이 한국 수출을 견인/둔화시키는지 직관적으로 파악하도록 한다.
- **핵심 산출물**:
  1. 품목 선택 → **월별 수출액 추세 차트** + **전년동월대비(YoY) %**.
  2. **당월 품목 랭킹**(수출액 상위 + 기여도).
  3. (옵션) **무역수지**(수출−수입) 추세.
  4. **당월 순별 잠정 실시간 반영**(발표일 즉시) — **단, 순별 수출 소스 확정을 전제**(§3.2 · Critical).
- **"수출액" 정의**: 관세청 **신고 미화금액(USD, FOB 기준)**. 월 단위 합계. 통화 USD 원값 기본(§7 Q2).
- **품목 정의**: 대중에게 익숙한 **주요 품목군**(반도체·자동차·석유제품·선박·무선통신기기·자동차부품·디스플레이·철강·석유화학·컴퓨터 등)으로 HS를 매핑(§3.3).

---

## 2. 스코프

| 항목 | 결정(제안) | 비고 |
|---|---|---|
| 대상국 | **대한민국 수출 총계**(전 세계 대상) | 국가별 분해는 후속 |
| 지표 | **수출액 중심** + (옵션) 수입액·무역수지 | 수출 FOB / 수입 CIF(§3.1) |
| 품목 단위 | **주요 품목군 ~15종**(HS→품목군 매핑) + **"기타" 잔여** | HS 10단위 상세는 MVP 제외 |
| 기간 | 월별, 백필 시작월은 소스 가용성에 따름(§7 Q3) | `firstAvailable` 동적 |
| 통화 | **USD 원값**(기본) | 원화환산은 후속 |

**비채택(후속)**: 국가×품목 교차, HS 10단위 상세, 물량(kg)·단가지수.

---

## 3. 데이터 가용성 분석

### 3.1 확정 월별 소스 — 관세청 품목별 수출입실적(GW) OpenAPI

- 출처: `data.go.kr/data/15101609`. REST, **XML 응답(JSON 미지원)**, `serviceKey` 필수. 개발계정 **10,000건/일**.
- **집계 기준**: 수출=**신고 미화금액(FOB)**, 수입=과세가격(**CIF**), 순중량(kg). HS부호 2/4/6/10단위. → **무역수지=수출(FOB)−수입(CIF)** 혼합이므로 UI에 각주(§6.6).
- **갱신주기**: 매월 15일경 전월 확정(잠정→확정 정정). 지연(16·17일) 가능 → cron 재시도·확정여부 판별 필요(§5).
- **🔴 계약 미공개 — 0단계 실호출로 반드시 고정할 항목**:
  - **금액 단위**(USD 원값 vs 천 달러) — **순별은 "천 달러"인데 GW 단위 미명시. 불일치 시 1,000배 오적재**(sam C2, super m3). 수집 스크립트에서 **USD 원단위 정규화** 필수.
  - 조회 기간 파라미터명·포맷(YYYYMM 등), HS 단위 파라미터, 수출입 구분.
  - **응답 XML 태그명 + 네임스페이스 접두사 유무**(있으면 SEC 13F식 `replace(/<(\/?)\w+:(\w)/g,"<$1$2")` 전처리 필수, 없으면 파싱 전량 실패).
  - **페이지네이션·`totalCount`·1호출당 반환 범위** → **138개월 백필 총 호출수 실측**. HS 4단위(~1,200~2,000개)·페이지 분할이 강제되면 호출 폭증(예: 75개 HS×138월≈1만 호출 → 10,000/일 한도 근접). 기간 범위(from~to) 조회 지원 여부 확인.
  - **에러 규약**: data.go.kr은 실패도 **HTTP 200 + `resultCode`/`errMsg`** 반환 → `res.ok`만 보면 안 되고 resultCode 파싱 검증 필수.
  - **serviceKey 인코딩**: encoded/decoded 형태 혼동 시 `SERVICE_KEY_IS_NOT_REGISTERED` 빈발 → 저장 형태·인코딩 규약 고정(기존 `src/lib/logged-fetch.ts` 재사용 권장).

### 3.2 실시간 순별(10일) 잠정치 — 발표일 즉시 갱신 (🔴 Critical: 소스 미확정)

- 목표: 진행 중인 달의 잠정 수출을 **1~10일→11일, 1~20일→21일, 월간→익월1일**에 즉시 반영.
- **🔴 소스 실존 미확인**: data.go.kr에 **수입판(15157901)만 실확인**, "수출 주요품목별 10일 단위 잠정치" **독립 데이터셋은 검색 미발견**. 수입판 품목(원유·가스·석탄)과 수출판 예상 품목(반도체·승용차 등)은 전혀 달라 **동일 구조 보장 없음**. → "발표일 즉시 갱신"이라는 **핵심 차별점 전체가 미확정 소스에 의존**(super C1·sam C1).
- **백업 플랜(0단계에서 실존 확인 실패 시)**:
  - (a) **관세청 보도자료 파싱**: `customs.go.kr` 순별 수출입 현황 게시물(11/21/익월1 게시)의 HTML/PDF에서 주요품목 수출 추출.
  - (b) **당월 잠정 미제공**: 순별 기능 보류, 당월은 GW 확정(익월15일)까지 **공란** 처리(기능 축소 MVP).
  - (c) K-stat/KOSIS 대체.
  - → **셋 중 어느 것도 없으면 "발표일 즉시 갱신" 요구는 미충족**임을 사용자에 사전 고지.
- **확정 시 파라미터/응답(수입판 기준, 수출판 실측 고정)**: `serviceKey`, 기준기간(YYYYMM), **순번(1~10/1~20/월간)**, 품목. 응답: 수출금액(**천 달러**), 품목명, 기간구분.
- **⚠️ 데이터 성격(구현 계약)**:
  1. **누적 구간**: 1~20일 = "1~20일 **누적**"(11~20일 단독 아님). 월 시계열/증분과 혼동 금지.
  2. **잠정 행 렌더 정책**: 당월 잠정 `exportUsd`(예 1~20일 누적)를 "월 확정치"처럼 보여주면 실제의 ~65%로 과소 표기. → **잠정 행은 `provisional=true`·`periodLabel`을 응답에 실어 UI가 "진행 중(1~20일)"로 명시**(§5·§6).
  3. **잠정 YoY 편향**: 진행 중 누적을 전년 **확정** 동월과 YoY 비교하면 항상 음수 편향. → **잠정 행의 YoY는 표시하지 않음(null)** 또는 "동일 기간(전년 1~20일) 대비"로만 계산. 기본: **미표시**(§6.3).
  4. **정정 재발표**: 순별이 이후 발표에서 이전 순 값을 소급 정정할 수 있음(1~10일이 나중에 수정). cron이 발표일마다 당월 재조회로 흡수하되, **직전 잠정치 감사 로그**(§S1) 권장.
  5. **커버리지 제한**: 주요 ~10품목만 → 순별 미커버 품목은 당월 결측(`—`).
  6. **수출/수입 별도 API**: 순별 무역수지는 두 API 동시 호출.

### 3.3 분류체계(HS ↔ 품목군) 매핑 + 커버율

- **문제**: 관세청은 HS부호, 대중은 산업부 MTI("반도체·자동차"). 1:1 아님.
- **방안 A(권장)**: 관세청 API + **큐레이션 HS→품목군 매핑 상수**(반도체=8541·8542, 승용차=8703, 석유제품=2710 …). HS 4단위 집계를 품목군으로 합산.
- **방안 B**: KOSIS/K-stat(MTI) 정확일치. 단 공개 API 제약.
- **🟠 합산 정합 요건(sam M1·super m4)**:
  - **누락**: 어느 품목군에도 매핑 안 된 HS는 집계 제외 → **"기타" 잔여 버킷**으로 흡수하거나 총수출 별도 조회로 커버율 산출.
  - **중복 금지**: 매핑은 **disjoint partition**(한 HS→한 품목군). 검증 스크립트로 중복 검출.
  - **커버율 명시**: "상위 15개 품목군이 총수출의 N% 커버" 수치를 산출·문서화.
  - **편차 허용기준**: 품목별 수출액이 관세청 보도자료/K-stat 대비 **±5% 이내면 매핑 근사로 허용**, 초과 시 매핑 재검토(§4단계 A1).
- **결론**: MVP는 방안 A + 기타 버킷 + 커버율. 산업부 정합이 중요해지면 B로 전환(응답 계약 유지).

### 3.4 AGENTS.md / 프로젝트 제약 정합

- **XML 파싱**(SEC 13F 선례) + **serviceKey 환경변수**(`CUSTOMS_SERVICE_KEY`) 신규. XML 파서 의존성 유무 0단계 확인(없으면 경량 파서 결정).
- **적재량**: 품목군 ~15종 × ~138개월 ≈ 2,000행대(+순별 소량). 라이브 PostgreSQL 소량, 배치 20 영향 작음.
- **레이트리밋/호출량**: **§3.1의 백필 총 호출수 실측 전까지 "여유" 단정 불가**. per-HS 호출 강제 시 10,000/일 근접 → 백필 2일 분할 또는 범위조회 필요.

---

## 4. 데이터 모델

```prisma
model MonthlyExport {
  id          String   @id @default(cuid())
  itemCode    String   // 내부 품목군 코드 ("SEMICON","AUTO","OIL_PROD","ETC" …)
  itemName    String   // 표시명 ("반도체")
  yearMonth   String   // "YYYY-MM" (수집/조회 시 포맷 정규화 강제)
  exportUsd   BigInt   // 수출액 USD 원단위(정수). 순별=천달러→×1000 정규화, GW=단위 확정 후 정규화
  importUsd   BigInt?  // 수입액 USD 원단위(옵션)
  provisional Boolean  @default(false) // 순별 잠정(true) vs GW 확정(false)
  periodLabel String?  // 잠정 기준구간 "1~20일" (확정이면 null)
  updatedAt   DateTime @updatedAt

  @@unique([itemCode, yearMonth])  // 월 단위 1행 — 잠정→확정 자연 덮어쓰기
  @@index([yearMonth])             // 당월 랭킹 쿼리용 (unique가 [itemCode,yearMonth] 커버하므로 중복 index 제거)
}
```

- **`BigInt` 정수 단위 채택**(sam m2): 수출액은 정수 달러(또는 천달러×1000)라 부동소수 오차 회피. 랭킹 정렬·무역수지 계산 안전. (Prisma BigInt ↔ JSON 직렬화는 API에서 문자열/Number 변환 규약 정의.)
- **잠정→확정 라이프사이클**: 당월은 순별로 `provisional=true`, `periodLabel` 순차 upsert → 익월15일 GW 확정치가 **같은 (itemCode,yearMonth) 행을 `provisional=false`로 덮어씀**.
- `yoyPct`·`balanceUsd`는 **조회 시 계산**(YoY=12개월 전 행, 수지=export−import). **잠정 행 YoY는 null**(§3.2-3).
- `yearMonth`는 String이나 **`YYYY-MM` 포맷 정규화 공용함수**로 입력 강제(정렬 안정성, sam m3).
- HS/순별 원자료는 저장 안 함 — **품목군 집계 후 저장**(매핑은 수집 스크립트 소유).

---

## 5. API 규격

```
GET /api/exports/monthly?item=SEMICON&from=2015-01&to=2026-06&metric=export
GET /api/exports/ranking?ym=2026-06&metric=export&top=10
GET /api/exports/meta        // 지원 품목군 목록 + firstAvailable + latestConfirmedYm
```

- **`/api/exports/monthly`** — 품목 월별 시계열
  - 파라미터: `item`(필수), `from`/`to`(선택 `YYYY-MM`), `metric`(export|import|balance, 기본 export)
  - 응답:
    ```jsonc
    {
      "item": { "code": "SEMICON", "name": "반도체" },
      "rows": [
        { "yearMonth": "2015-01", "exportUsd": 5123000000, "yoyPct": null, "provisional": false, "periodLabel": null },
        { "yearMonth": "2026-06", "exportUsd": 8500000000, "yoyPct": null,  "provisional": true,  "periodLabel": "1~20일" }
      ],
      "summary": { "firstAvailable": "2015-01", "latestConfirmedYm": "2026-05",
                   "latestYm": "2026-06", "latestYoyPct": 12.4, "cagrPct": 6.1 }
    }
    ```
    - **신규 필드 `provisional`·`periodLabel`**(super M2·wonder H3): 프론트 잠정 배지·점선의 데이터 근거.
    - **YoY 계산 N+1 방지**(super M4): top N/시계열 모두 **`where yearMonth in (당월, 전년동월 …)` 단일 range 쿼리 후 메모리 조인**. `@@index([yearMonth])` 활용.
    - `cagrPct` 분모: `firstAvailable`(가용 최초) 아닌 **조회 `from`~`to` 기간** 기준으로 명시. `firstAvailable`은 별도 메타.
- **`/api/exports/ranking`** — 특정 월 품목 랭킹
  - 파라미터: `ym`(필수), `metric`(export|balance), `top`(기본 10)
  - 응답 `rows[]`: `{ rank, itemCode, itemName, exportUsd, yoyPct|null, provisional }` + `coverage: { coveredItems, totalItems, provisional }`.
  - **순별 미커버 품목 정책**(sam M6): 당월 잠정 조회 시 미커버 품목은 **랭킹에서 제외**(null을 0 취급 금지)하고 `coverage`로 "N/총M 품목 반영" 안내. 확정월은 전 품목.
- **`/api/exports/meta`**: 품목군 목록 + `firstAvailable` + `latestConfirmedYm`(UI 기본값·잠정 판별용).
- Next.js 16: API route는 `req.nextUrl.searchParams`라 params Promise 무관(정확). **page 서버컴포넌트 `searchParams`는 Promise → await**(§6.1).

### 수집/백필
- **백필 스크립트** `scripts/backfill-exports.ts`(멱등): GW API 품목군 매핑 호출 → **단위 정규화(USD)** → 품목군 합산(+기타) → `MonthlyExport`(provisional=false) upsert. **XML 파싱 + resultCode 검증 + (필요시)네임스페이스 strip**.
- **갱신 cron — 기존 오케스트레이터에 날짜 가드**(super M1): 실제 배포는 **단일 daily cron**(`vercel.json` `0 22 * * *`, KST 07:00)뿐. 신규 날짜지정 cron을 늘리지 않고 **`src/app/api/cron/daily/route.ts`에서 KST 날짜로 분기**:
  - `day∈{11,21} 또는 (day==1)` → 순별 수출 API로 당월 주요품목 `provisional=true` upsert.
  - `day≥15 && 전월 미확정` → GW로 전월(+정정 대비 최근 2~3개월) 재조회, `provisional=false` 덮어쓰기.
  - 수출 수집은 품목 ~15종·소량이라 **`await` 직접 처리**(주가 200종목식 self-chaining/슬라이스 불필요).
  - **발표 시각 vs cron(KST 07:00) 도달 여부 0단계 확인** — 미도달 시 하루 지연.
- **정합**: 순별 월간 잠정 vs GW 확정 **편차 임계치**(예 >15% 로그/알람) 정의(sam M2). 확정치(GW) 우선.

---

## 6. UI 화면 구성 규격

- **위치**: 신규 `/exports`. 내비 링크는 **모바일 `MobileNav`의 MORE_ITEMS + `Sidebar` NAV_ITEMS**에 추가(모바일 PRIMARY_TABS는 4개 만석 → 더보기 편입, wonder L4). `<Disclaimer/>`는 **layout 전역 footer로 충족**(페이지 중복 금지 — `returns` 선례 확인됨).

### 6.1 페이지 아키텍처 (Next.js 16)

```
/exports (Server Component, searchParams=Promise → await)
├─ getExportSeries(item, from, to, metric) → 월별 시계열(+YoY, provisional)
├─ getExportRanking(ym, metric)            → 당월 랭킹(+coverage)
├─ getExportMeta()                         → 품목목록·firstAvailable·latestConfirmedYm
├─ <ExportControls/>   (Client) 품목·기간·지표 → searchParams 갱신
├─ <ExportSummaryCards/> (Server, StatCard 패턴) 최신월·YoY·CAGR·(옵션)무역수지
├─ <ExportTrendChart/>  (Client, Recharts) 막대(수출)+라인(YoY) 이중축
├─ <ExportRanking/>     (Server, CSS 막대) 당월 랭킹 — 클릭은 <Link href="?item=">
└─ (옵션) <TradeBalanceChart/> (Client)  ← MVP 포함 여부 §6.7 결정
```
- 데이터·표·랭킹·요약=**서버 컴포넌트**, 차트·컨트롤만 **클라이언트**. searchParams가 상태 원천.
- **선행 리팩토링(wonder H1)**: `YearMonthSelect`가 현재 `ReturnsControls.tsx` **내부 비공개 함수** → 재사용하려면 **`src/components/YearMonthSelect.tsx`로 extract+export** 선행. (returns 페이지도 이 컴포넌트로 교체.)

### 6.2 레이아웃 (데스크톱)

```
┌───────────────────────────────────────────────────────────┐
│ 월별 품목별 수출        [지표 ▾ 수출]                       │
│ 관세청 신고 미화금액(USD·FOB) · 당월 잠정                   │
│ [품목 ▾ 반도체] [기간 2015 ─ 2026]                         │
├───────────────────────────────────────────────────────────┤
│ ┌최신월 수출┐ ┌전년동월비┐ ┌기간 CAGR┐ ┌무역수지(최신)┐  │
│ │131.2억$   │ │ +12.4%  │ │ +6.1%   │ │ +52.8억$    │  │
│ │2026-06 잠정│ │(녹)    │ │         │ │(녹)         │  │
│ └───────────┘ └─────────┘ └─────────┘ └─────────────┘  │
├───────────────────────────────────────────────────────────┤
│ 반도체 월별 수출 추세         수출액▮ YoY─  [YoY][기간▾]    │
│  (막대=수출 좌축, 라인=YoY 우축, 당월=반투명)               │
├───────────────────────────────────────────────────────────┤
│ 당월(2026-06, 잠정 1~20일 · 8/15품목) 수출 랭킹            │
│ 1 반도체 ██████████ 131.2억$  (잠정, YoY 미표시)           │
│ 2 자동차 ██████     61.0억$   +3.1%                        │
│ …                                                         │
├───────────────────────────────────────────────────────────┤
│ (옵션) 무역수지 추세                                        │
│ <Disclaimer/> (layout 전역)                                │
└───────────────────────────────────────────────────────────┘
```

### 6.3 컴포넌트별 구현

1. **`ExportControls` (클라이언트)** — `ReturnsControls` 구조 재사용 + **지표 세그먼트 토글**(수출/수입/무역수지) 추가. 기간=extract된 `YearMonthSelect` + 프리셋. `router.replace`.
2. **`ExportSummaryCards` (서버)** — **`IndicatorCard`가 아니라** returns의 **`StatCard` 패턴**(서버 컴포넌트, wonder M1) 재사용. 4카드. 당월 잠정이면 "잠정(1~20일)" 라벨.
3. **`ExportTrendChart` (클라이언트, Recharts `ComposedChart`, `next/dynamic` code-split)**:
   - 막대=수출액(좌축), 라인=YoY %(우축 이중축) + `<ReferenceLine y={0}>`. **YoY 라인은 단색 + 0기준선**(구간별 색분기 아님 — Recharts 제약, wonder M3).
   - **당월 잠정 막대 = 반투명 `<Cell fillOpacity={0.4}>`**(점선은 커스텀 shape 난이도 높아 제외, wonder M2).
   - **긴 구간 밀도 대응(wonder H4)**: **10년↑ 구간은 막대→라인 자동 전환** 또는 **연 집계**, **모바일 기본 프리셋 "최근 5년"**. (기본: 5년↑ 라인 전환.)
   - 빈 데이터/로딩 분기 필수, height 고정(CLS 방지).
4. **`ExportRanking` (서버, 순수 CSS 막대 `width:%`)**(wonder L6): 서버 컴포넌트 유지·JS 0. 행=순위·품목·막대·금액·YoY 배지(색+숫자 병기). **클릭 이동은 `<Link href="?item=…">`**(서버 유지, wonder H2). 잠정월은 미커버 제외 + coverage 안내.
5. **`TradeBalanceChart` (옵션)** — §6.7에서 **MVP 제외** 결정(후속). metric=무역수지는 요약 카드로만.

### 6.4 모바일 (Playwright 실측 필수)

- 요약 2열 그리드. 차트 폭 100%·height 고정, **기본 최근5년**·이중축이면 **모바일 YoY 기본 off**(우축 숨김, wonder M4). 랭킹 세로 스택. 컨트롤 `flex-wrap`.

### 6.5 상태·인터랙션

- URL `?item=SEMICON&from=..&to=..&metric=export`. 기본값: item=SEMICON, from=`firstAvailable`(meta 조회), to=`latestYm`, metric=export.
- 랭킹 기준월 = `to`. 랭킹 품목 `<Link>` → `item` 전환.

### 6.6 접근성·표기

- 색 신호에 **숫자·부호 병기**, 차트 `aria-label`.
- **필수 표기**: "관세청 신고 미화금액(USD·수출 FOB/수입 CIF)". 당월은 **"이번 달 N일까지 집계한 잠정치(확정은 다음 달 15일경)"** 풀어쓴 배지/툴팁(비전문 타깃, wonder L1). 순별 미커버 품목 `—`.
- **로딩/빈/에러**(wonder L2): `loading.tsx` Suspense, 차트 빈상태 분기, `error.tsx`.
- **포맷 유틸**(wonder L3): `formatExportUsd()`(USD→억$/조원) 신규 — 기존 `formatValue`(IndicatorType 전용) 재사용 불가.

### 6.7 결정

- 차트: 막대(수출)+라인(YoY) 이중축, **5년↑ 라인 전환**. 단위 억$(툴팁 원값). 랭킹 기준월=`to`.
- **`TradeBalanceChart`: MVP 제외**(무역수지는 요약 카드만). **점선 제외(반투명만)**. **`ExportRanking` 클릭=Link(MVP 포함)**.

---

## 7. 의사결정 · 착수 전 확정 항목

### 7.1 🔴 착수 차단(0단계 실호출로 반드시 확정 — E1~E8)

| # | 항목 | 방법 | 차단 |
|---|---|---|---|
| E1 | **순별 수출 데이터셋 실존·ID·품목목록·파라미터** | serviceKey 발급 후 실호출. 부재 시 백업(§3.2) | **차단** |
| E2 | **GW 응답 XML 태그명 + 네임스페이스 유무** | 실호출 원문 캡처 | **차단** |
| E3 | **GW·순별 금액 단위 통일**(USD vs 천달러) | 실호출 + 보도자료 대조(1,000배 여부) | **차단** |
| E4 | **순별 파라미터명**(기준기간·순번) | 수출판 실호출 | **차단** |
| E5 | GW 과거 가용 최초월 | `from=2015-01` 실호출 | 🟠 |
| E6 | GW 기간범위 조회 지원·페이지네이션→백필 총호출수 | 실호출 | 🟠 |
| E7 | resultCode 에러 규약·serviceKey 인코딩 형태 | 실호출 | 🟠 |
| E8 | 순별 발표 실제 시각 vs cron KST 07:00 | 게시시각 확인 | 🟠 |

### 7.2 비차단 결정(기본값 제안)

1. **[Q1] 분류체계**: 방안 A(관세청+매핑) 권장.
2. **[Q2] 통화**: USD 원값.
3. **[Q3] 백필 시작월**: 2015-01 후보(E5 확정).
4. **[Q4] 수입·무역수지**: 요약 카드만 포함(차트 후속).
5. **[Q5] 품목 매핑·커버율**: disjoint + 기타 버킷, 커버율 산출.
6. **[Q6] 순별 반영 범위**: 당월 주요품목만(E1 성공 시).
7. **[Q7] 잠정 YoY**: **미표시**(편향 방지) — 기본.

### 7.3 감사/모니터링(권장)

- **[S1]** 확정 전환 시 직전 잠정치 감사 로그(덮어쓰기 전 보존).
- **[S2]** `/api/exports/audit?ym=` — 순별 잠정 vs GW 확정 편차 조회(QA·운영용).

---

## 8. 단계별 로드맵 (코딩은 차후)

- **0단계(선결, 차단)**: serviceKey 발급 → **GW + 순별 수출 API 실호출로 E1~E8 전부 확정**(순별 부재 시 백업 결정). HS→품목군 매핑(disjoint+기타) + 커버율 산출.
- **1단계(백엔드·super)**: `MonthlyExport`(BigInt·provisional·periodLabel) + db push. `backfill-exports.ts`(단위 정규화·resultCode·네임스페이스·멱등).
- **2단계(백엔드·super)**: `/api/exports/monthly`·`/ranking`·`/meta`(provisional·coverage·N+1 방지). **cron을 daily 오케스트레이터 날짜가드로** 통합(순별 11/21/1 + 확정 15↑, 재시도).
- **3단계(프론트·wonder)**: `YearMonthSelect` extract 선행 → `/exports`(컨트롤·이중축 차트·CSS 랭킹·StatCard·잠정 배지·formatExportUsd·loading/error). 내비 MORE_ITEMS+NAV_ITEMS. 모바일 Playwright.
- **4단계(QA·sam)**: 아래 테스트 시나리오 실측.
- **(후속)** 국가×품목, HS 상세, 원화환산, 무역수지 차트, 물량·단가.

### 8.1 QA 테스트 시나리오(핵심, §4단계)

- **정합(교차검증, 독립출처)**: A1 반도체 특정월 vs 관세청 보도자료(±5%), A2 vs K-stat, A3 15품목합 vs 총수출(커버율), A5 GW·순별 단위 1,000배 여부.
- **경계**: 최초월 YoY null(12행), from>to→400, 없는 item→404/빈, 발표 전 당월 랭킹(빈/전월), 미커버 품목 랭킹 제외.
- **잠정↔확정**: 순별 1~10→1~20 덮어쓰기 증가, 1~말일→GW 확정 전환(배지·반투명 소멸), 정정 재조회 갱신, 잠정 YoY 미표시.
- **에러/운영**: API 500 시 기존 행 무손상, 부분 응답 시 잔여 품목 유지, 백필 멱등, XML 네임스페이스 strip 없으면 전량 null 재현, 10,000건/일 초과.

---

## 9. 결론 (한 줄)

구조 골격(2원 소스·`provisional` 라이프사이클·조회계산 YoY/수지)은 견고하나, **"발표일 즉시 갱신"의 전제인 순별 수출 소스 실존·두 소스 금액 단위·GW XML 계약은 실호출 전 확정 불가한 차단 요인**이다. 따라서 **0단계(serviceKey 발급 + E1~E8 실호출 고정 + 매핑/커버율 확정)를 진짜 선결로** 두고, 응답에 `provisional`·`coverage`를 실어 UI 잠정 표기를 지지하며, cron은 기존 daily 오케스트레이터 날짜가드로 통합하면, 신규 외부 의존을 최소화해 안전하게 구현할 수 있다.

---

**Sources (실조사):**
- [관세청_품목별 수출입실적(GW)](https://www.data.go.kr/data/15101609/openapi.do) — 확정 월별
- [관세청_수입 주요품목별 10일 단위 잠정치](https://www.data.go.kr/data/15157901/openapi.do) — 순별(수입판만 확인, **수출판 미확인**)
- [관세청 보도자료 — 순별 수출입 현황(백업 소스)](https://www.customs.go.kr/kcs/na/ntt/selectNttList.do?bbsId=1362&mi=2891)
- [K-stat 무역통계(HS·MTI·SITC)](https://stat.kita.net/stat/kts/pum/ItemImpExpList.screen)
- [KOSIS 국가통계포털](https://kosis.kr/)
