# 기능 설계: "일정 기간 이후 52주 신고가 돌파" 스크리너 필터

> 작성: javis (PM 오케스트레이터) · 2026-06-29 · 상태: 설계(미구현)
> 한 줄 요약: 일정 기간(N) 동안 신고가 없이 횡보/조정하다가, 최근(M일 이내)에 52주 신고가를 돌파한 종목을 발굴하는 스크리너 옵션.

---

## 1. 요구사항 정의

### 1.1 용어 / 신고가 돌파의 정의
- **신고가 돌파(Breakout) 이벤트** (특정 일자 `d`):
  `price(d) >= high52w(d) × (1 − tolerance)`
  - `high52w(d)`는 Yahoo `meta.fiftyTwoWeekHigh` (해당일 기준 52주 최고가, 롤링 max). 신고가를 새로 찍는 날은 `price ≈ high52w` 가 되므로 비율이 ~100%.
  - `tolerance`(기본 0.5%)로 "근접 돌파/재터치"까지 포섭. 장중/수집시점 차이로 100% 초과가 나올 수 있어 표시 시 100% 상한 처리.
- **조정/횡보(Quiet) 구간**: 돌파 직전 N구간 동안 신고가 이벤트가 **없었던** 상태.
  - 운영 정의: 그 구간 내 모든 거래일에서 `ratio(d) = price(d)/high52w(d) < quietMaxRatio` (기본 80%). 즉 고점에서 충분히(20% 이상) 떨어져 횡보/조정했다는 의미.

### 1.2 파라미터화
| 파라미터 | 의미 | 기본값 | 범위 |
|---|---|---|---|
| `breakout` | 필터 on/off | false | bool |
| `breakoutQuietDays` (N) | 조정 구간 길이(거래일) | 60 (~3개월) | 20·60·120 프리셋 |
| `breakoutWindowDays` (M) | 돌파 인정 최근 구간(거래일) | 5 | 1·5·10 |
| `breakoutTolerance` | 돌파 인정 허용오차(%) | 0.5 | 0~2 |
| `breakoutQuietMaxRatio` | 조정 구간 상단 비율(%) | 80 | 60~95 |

### 1.3 엣지케이스
- **상장 1년 미만 / 히스토리 부족**: 윈도(N+M 거래일) 데이터가 없으면 판정 불가 → 결과에서 제외하고, 사유 표기(`insufficient_history`). 필요 데이터 밀도 미만(아래)도 동일 처리.
- **데이터 결손(수집 실패일·주말·공휴일)**: 캘린더일이 아닌 **거래일(스냅샷 존재일)** 기준으로 카운트. 윈도 내 스냅샷 밀도가 기대치의 80% 미만이면 판정 보류(제외+사유).
- **동시 신고가(시장 전체 랠리)**: 다수 종목이 동시에 돌파해도 필터는 유효. 정렬(돌파 최신순/조정기간 길이순)으로 우선순위 부여.
- **`high52w == 0` / `price == 0`**: 가드(기존 코드도 `high52w > 0` 가드 존재).
- **돌파 직후 재돌파**: M구간 내 여러 돌파일이 있으면 가장 최근 돌파일을 `breakoutDate`로.

---

## 2. 데이터 가용성 분석 (핵심 의사결정)

### 2.1 현재 저장 구조 — 결론: **신규 모델 불필요**
- `StockSnapshot` (`prisma/schema.prisma:190`)는 종목·일자별로 `date`, `price`, `high52w`, `low52w`를 저장하며 `@@unique([stockId, date])` + `@@index([date])` 보유. → **일자별 (가격, 52주고가) 시계열이 이미 스키마상 존재**.
- `high52w`는 수집 시 Yahoo `meta.fiftyTwoWeekHigh`를 그대로 저장 (`src/lib/stock-collector.ts:144`, `:218`). 즉 우리가 따로 롤링 max를 계산하지 않아도, **각 수집일의 52주 고가가 그날 값으로 보존**됨.
- 일일 cron(`vercel.json` → `/api/cron/daily`, 매일 22:00 UTC=07:00 KST → `collect-stocks`)이 매일 1행씩 누적. `StockSnapshot`에는 **보존(prune) 정책이 없어** 무기한 누적됨 (cf. `ApiRequestLog` 7일, `CollectionRun` 30일).

→ **52주 신고가 + "기간 이후 돌파" 판정은 현재 스키마로 가능**하다. 단, 아래 게이팅 이슈가 있다.

### 2.2 게이팅 이슈 — 누적 히스토리 길이 (검증 필요)
- 현재 주가 수집은 Yahoo chart `range=5d`만 호출(`src/lib/stock-collector.ts:106`) → **단발성으로는 과거 시계열을 못 가져옴**. 오직 cron이 매일 돌면서 한 행씩 쌓아온 만큼만 히스토리가 존재.
- 따라서 기본값(N=60 + M=5 ≈ 65 거래일 ≈ 약 3개월) 판정을 하려면 **약 3개월치 일별 스냅샷이 누적**돼 있어야 함. cron 가동 시점이 짧으면 결과가 비거나 신뢰도 낮음.
- **[액션] 라이브 DB(PostgreSQL/Supabase)에서 누적 일수를 검증**해야 함:
  `SELECT COUNT(DISTINCT date::date) FROM "StockSnapshot";` 및 최古 date.

### 2.3 데이터 보강 방안 (필요 시)
- **옵션 B — 일회성 히스토리 백필 (권장, 누적 부족 시 필수)**: Yahoo chart `range=2y&interval=1d`로 종목별 일별 종가(+고가) 시계열을 받아, **롤링 252거래일 max로 high52w(d)를 자체 계산**하여 `StockSnapshot`에 과거 행 upsert.
  - 장점: cron 가동 기간과 무관하게 즉시 전 구간 확보. 신규 모델 불필요(기존 `StockSnapshot` 재사용, PER/PBR 등은 null 허용).
  - 주의: 백필 행은 종가 기반 롤링 max라 Yahoo의 일일 `fiftyTwoWeekHigh`(장중 고가 반영 가능)와 미세 차이 → 스크리닝 용도로 허용. 정밀도 필요 시 chart `high` 배열 사용.
  - 규모: 200종목 × ~504행 ≈ 10만 행 (Postgres 무리 없음). 호출 200건은 기존 `PARALLEL`/`BATCH_DELAY` 패턴 재사용.
- **옵션 A — 누적분만 사용**: 추가 수집 0. 단 누적이 충분할 때만 유효. 부족하면 기능이 한동안 빈 결과.

> **의사결정 요약**: 스키마 변경 없이 `StockSnapshot` 재사용으로 구현 가능. 단 **누적 히스토리가 윈도를 못 채우면 일회성 백필(옵션 B)이 임계경로**가 된다. 먼저 누적 일수부터 검증할 것.

---

## 3. 알고리즘 설계 (의사코드)

```
input: universe stocks, params {N, M, tolerance, quietMaxRatio}
cutoff = today - (N + M + buffer) 거래일   // buffer로 결손 보정
rows = StockSnapshot.findMany(
         where date >= cutoff AND stockId in universe,
         orderBy [stockId asc, date asc])
byStock = group rows by stockId

for each stock s with series S (date asc):
    if tradingDays(S) < (N + M) * 0.8: 
        mark insufficient_history; continue
    recent  = last M trading days of S
    quiet   = the N trading days immediately before `recent`

    ratio(d) = price(d) / high52w(d)        // high52w(d) > 0 가드
    breakoutDays = [d in recent where ratio(d) >= 1 - tolerance]
    breakoutRecently = breakoutDays not empty
    quietOK = for all d in quiet: ratio(d) < quietMaxRatio   // 신고가 없이 횡보/조정

    isBreakout = breakoutRecently AND quietOK
    breakoutDate = max(breakoutDays)
    consolidationDays = quiet 구간에서 마지막으로 ratio>=quietMaxRatio 였던 이후 경과 거래일
    priorMaxRatio = max(ratio(d) for d in quiet)   // 조정 깊이 참고

emit items where isBreakout (when breakout filter on)
```

- 비용: 200종목 × ~70행 ≈ 1.4만 행 1쿼리 + 메모리 그룹핑. **요청당 충분히 저렴 → 사전계산/스키마 추가 불필요**(파라미터 가변성도 그대로 수용).

---

## 4. API 설계 (`GET /api/screener` — `src/app/api/screener/route.ts`)

### 4.1 신규 쿼리 파라미터
- `breakout` = `"true"` | (생략)
- `breakoutQuietDays` (int, 기본 60)
- `breakoutWindowDays` (int, 기본 5)
- `breakoutTolerance` (float %, 기본 0.5)
- `breakoutQuietMaxRatio` (float %, 기본 80)
- `sortBy` 에 `"breakoutDate"` 값 추가 (돌파 최신순)

### 4.2 응답 `Item` 추가 필드
```ts
breakout: boolean;           // 돌파 조건 충족 여부
breakoutDate: string | null; // 최근 돌파일(ISO)
consolidationDays: number | null; // 직전 조정 지속 거래일 수
priorMaxRatio: number | null;     // 조정 구간 최대 근접도(%)
breakoutReason?: "insufficient_history" | "low_density" | null; // 판정 보류 사유
```
- `breakout=true`일 때만 히스토리 윈도 쿼리를 수행(미사용 시 기존 단일일 경로 유지 → 성능 회귀 없음).
- 필터 활성 시 `items = items.filter(i => i.breakout)`.

---

## 5. UI 설계 (`src/app/screener/page.tsx`)

- **위치**: "가격 조건" 섹션(현재 52주 신고가 토글 `:347` 아래)에 신규 토글 행 추가.
- **컨트롤**:
  - 토글 "신고가 돌파 (조정 후 돌파)" — 기존 토글 스타일 재사용.
  - on 시 노출:
    - 조정 기간 프리셋 버튼: `1개월(20)` / `3개월(60)` / `6개월(120)` → `breakoutQuietDays`.
    - 돌파 시점 프리셋: `최근 1일` / `최근 5일` → `breakoutWindowDays`.
    - (선택, 고급) 허용오차 / 조정 상단비율 슬라이더.
- **결과 표시**:
  - "52주 고가 근접" 컬럼(`:573`)에 돌파 배지 추가: `🚀 신고가 돌파 · {consolidationDays}일 조정`, `breakoutDate` 툴팁.
  - 정렬 드롭다운(`:328`)에 "신고가 돌파 최신순"(`breakoutDate`) 옵션 추가.
- **상태/쿼리 연동**: `use52w` 패턴 그대로 — `useBreakout`, `breakoutQuietDays`, `breakoutWindowDays` state 추가, `fetchData`(`:140`) 의존성·URLSearchParams에 반영, `resetFilters`(`:209`)·`hasAnyFilter`(`:136`)에 포함.
- **검증**: 메모리 지침에 따라 추측 금지 — Playwright 실제 렌더링으로 모바일 포함 확인.

---

## 6. 구현 작업 분해 (의존성·순서·규모)

| # | 담당 | 작업 | 의존성 | 규모 |
|---|---|---|---|---|
| 0 | super | **라이브 DB 누적 히스토리 검증** (DISTINCT date 수·최古일) → 백필 필요 여부 판정 | — | XS |
| 1 | super | (0 결과 부족 시) **히스토리 백필**: Yahoo chart range=2y, 롤링 252d max로 high52w 계산, `StockSnapshot` 배치 upsert. 인증·멱등 | 0 | M |
| 2 | super | **스크리너 API**: breakout 파라미터·윈도 쿼리·신호 계산·응답 필드·sort 추가 | 계약 확정(아래) | M |
| 3 | super | (선택) 일일 cron에서 기본 파라미터 신호 사전계산·표시 | 2 | S |
| 4 | wonder | **스크리너 UI**: 토글·프리셋·결과 배지·정렬·쿼리 연동 | 2의 계약 | M |
| 5 | sam | **QA**: Playwright 렌더링·엣지케이스(상장<1년·결손·동시돌파)·성능 검증 | 2·4 | S |

- **순서**: 0 검증 → (1 백필 ∥ 2 API) → 4 UI → 5 QA.
- **계약 우선(Contract-first)**: 4.1/4.2의 파라미터·응답 스키마를 먼저 동결하면 super(2)와 wonder(4)가 병렬 진행 가능.

---

## 7. 리스크 / 오픈 이슈

1. **데이터 부족이 임계경로**: cron 누적이 윈도 미만이면 백필(작업 1) 없이는 빈 결과. → 작업 0 검증을 가장 먼저.
2. **Yahoo high52w 정의 차이**: 백필의 종가 롤링 max vs 실시간 `fiftyTwoWeekHigh`(장중 고가) → 미세 불일치. 스크리닝 허용, 정밀도 필요 시 chart `high` 배열 사용.
3. **무료 API 제약**: 백필 200콜은 Yahoo 비공식 API. 기존 `PARALLEL`/`BATCH_DELAY` 재사용해 레이트리밋 회피. (OpenFIGI/DART와 무관.)
4. **"돌파" 정의 합의**: 신규 신고가 vs 재터치 — `tolerance`로 흡수했으나 PO 확인 필요. "조정 깊이"(quietMaxRatio) 기본값도 합의 대상. → **§8.6 D-3/D-4에서 확정**(신규 경신만, 기본 80%).
5. **성능**: 200종목 한정이라 요청당 윈도 스캔으로 충분. 유니버스 확대 시 사전계산(작업 3) 전환 검토.
6. **DB 표기 stale**: AGENTS.md는 SQLite 기준이나 라이브는 PostgreSQL. 백필 배치 크기는 SQLite 20개 제약이 아닌 Postgres 커넥션 풀 기준으로 산정.

---

## 8. 설계 리뷰 결과 (super · wonder · sam, 2026-06-29)

세 전문 에이전트의 교차 리뷰에서 도출된 **구현 전 반드시 확정해야 할 사항**. 아래 합의/AC를 §1~§7에 반영해 계약을 동결한 뒤 구현에 착수한다.

### 8.1 🔴 Critical — 데이터 모델 정합성 (super·sam 공통)

- **[C-1] cadence 불일치 (super, 치명)**: cron은 `"0 22 * * *"`로 **주말·공휴일 포함 매일** 1행을 생성(가격 동일해도 `create`). 즉 주당 ~7행 누적 → `N=60`을 "거래일 3개월"로 가정했으나 실데이터는 캘린더 60행 ≈ **약 2개월**. 반면 **백필(Yahoo chart)은 거래일만** 반환 → 한 시계열에 두 cadence가 혼재. **결정 필요**: (a) 비거래일 행을 거르는 정규화 로직 도입, 또는 (b) "스냅샷 1행=1단위"로 재정의하고 N/M을 캘린더 기준으로 보정. **어느 쪽이든 백필·cron cadence를 일치**시킬 것.
- **[C-2] date 정규화 & 백필 멱등성 (super·sam)**: 라이브 행 `date`는 `new Date()` **수집 instant**(자정 아님)라 `@@unique([stockId,date])`가 캘린더일을 보장하지 못함. 백필을 다른 instant로 넣으면 같은 날 2행. → 백필 `date`를 **KST 자정 정규화**, 그룹핑은 **KST 캘린더일 버킷**. 백필은 `createMany({skipDuplicates:true})` 또는 "행 없을 때만 insert"로 **라이브 행 절대 덮어쓰기 금지**(재실행 안전).
- **[C-3] high52w 출처 불일치 → 위양성 (super·sam)**: cron=`meta.fiftyTwoWeekHigh`(장중 고가), 백필=종가 롤링 max. 경계일에서 분모(high52w)가 튀어 거짓 돌파 가능. → 백필은 chart **`high` 배열**로 롤링 max 계산해 라이브 정의에 근접. 허용 오차 **2% 이내**(AC-BACKFILL-ERROR), 초과 행은 판정 제외.
- **[C-4] 분모 붕괴 위양성 (super, must-fix)**: high52w는 52주 롤링이라 옛 고점 롤오프 시 분모 하락 → 가격이 안 올라도 ratio→1 "가짜 돌파". → 돌파 조건에 **"돌파일 price > quiet 구간 max price"**(실제 상승 확인) 추가, 또는 분모를 가격 기반 롤링 max로 일원화.
- **[C-5] 백필 60s 타임아웃 (super·sam)**: 200종목 fetch(~26s) + 10만 행 write는 단일 invocation 60s 초과 확실. → **로컬 일회성 node 스크립트**(`scripts/`, `collect-cli.mjs` 패턴) 적재 **권장**(60s 회피·재개 용이). 엔드포인트로 한다면 `cron-self.ts` 40종목 self-chaining 필수.

### 8.2 🟠 알고리즘 정의 보강 (sam)

- **[AC-QUIET-BOUNDARY]** `quietOK = ∀d∈quiet: ratio(d) < quietMaxRatio` (strict `<`, 경계값 == 은 실패). 돌파 `ratio ≥ 1−tolerance` (`≥`).
- **[AC-CONSOLIDATION-NOFLOOR]** quiet 구간 내 `ratio≥quietMaxRatio`인 날이 없으면 `consolidationDays = N`(전 구간). 윈도 밖 이전 고점은 조회 안 함.
- **[AC-PRIORMAX-UNIT]** `priorMaxRatio`는 기존 `high52wRatio`와 동일하게 **0~100 %**, 소수 1자리. (의사코드의 0~1 ratio와 단위 구분 명시)
- **[buffer 정의]** `cutoff` 계산의 buffer 미정 → `buffer = (N+M)×0.3 + 10 캘린더일` 등 고정 공식. 캘린더로 넉넉히 조회 후 메모리에서 거래일 절단.
- **[breakoutReason 판별]** `insufficient_history`(신규상장·행 부족)와 `low_density`(결손율 높음)를 구분하는 판별식 추가. quiet 이상치 1일로 전체 탈락 방지 위해 **위반 허용 ≤5%** 완화.

### 8.3 🟠 누락 엣지케이스 (sam)

- **[AC-SPLIT-WARNING]** 액면분할 시 분할 전 행의 `high52w`가 원가 기준으로 남아 가격 척도 불일치 → **분할 이력 종목은 신뢰 불가 known limitation**으로 문서화(자동 감지는 범위 외).
- **[AC-NULL-SORT]** `sortBy=breakoutDate` 시 `breakoutDate=null` 종목은 결과 **맨 뒤**(기존 `-Infinity` 패턴 재사용).

### 8.4 🟠 UI/UX 결정 (wonder)

- **[배지 위치]** 기존 "52주 고가 근접" 컬럼(`page.tsx:574`)은 이미 포화 → 돌파 배지는 **종목명 줄(`:552`) 인라인**에 배치(모바일 좌우 스크롤 없이 항상 보임). 동적 전용 컬럼은 리플로우 커서 비권장.
- **[breakoutDate 표시]** `title` 툴팁은 **모바일 미작동** → 날짜를 배지 텍스트에 직접("돌파 06/15").
- **[이모지 금지]** 🚀 대신 기존 톤에 맞춘 **텍스트+색상 배지**(에메랄드, 대비 ≥5:1).
- **[파라미터 라벨]** 숫자 대신 사람 말: "오늘/이번 주/최근 2주 돌파", "1·3·6개월 조정 후". tolerance·quietMaxRatio는 **"고급 설정" 접힘** 안에. "N거래일(약 M개월)" 단위 명시.
- **[정렬-필터 연동]** "신고가 돌파 최신순" 정렬은 **breakout 필터 ON일 때만** 드롭다운 노출(자동 ON은 혼란).
- **[빈/부족 상태]** breakout 전용 빈 결과 카피 분기(히스토리 부족 vs 조건 과다 vs 시장 하락) + 누적 부족 시 필터 상단 경고 배너(재무필터 `:478` 패턴 재사용) + ON 시 "히스토리 분석 중" 로딩 컨텍스트.
- **[접근성]** 신규 토글은 `role="switch"`+`aria-checked`+키보드(Enter/Space), 프리셋은 `aria-pressed`+`role="group"`, 슬라이더 `aria-valuetext`. (기존 `:347` 토글의 a11y 결함을 복제하지 말 것.)

### 8.5 프로세스

- **[Contract-first, sam m-3]** API 응답 신규 필드(`breakout/breakoutDate/consolidationDays/priorMaxRatio/breakoutReason`) **타입 정의를 별도 선행 PR로 머지**한 뒤 super(API)·wonder(UI) 병렬 → 빌드 불일치 방지.
- **[작업 0 선행]** 구현 착수 전 라이브 DB: `SELECT COUNT(DISTINCT (date AT TIME ZONE 'Asia/Seoul')::date), MIN(date) FROM "StockSnapshot";` (KST 캐스팅). 누적 < ~65거래일이면 백필 없이는 출시 불가.
- **권장 순서**: 작업0 검증 → (부족 시) 백필 스크립트 ∥ 타입 선행 PR → API(super) → UI(wonder) → sam Playwright E2E(토글 ON+프리셋, 정렬, 성능 회귀: OFF가 ON보다 빠름).

### 8.6 ✅ PO 결정 (2026-06-29 확정 — 계약 동결)

리뷰 §8.1~8.5의 오픈 이슈에 대한 PO 결정. 구현은 아래를 전제로 진행한다.

1. **[D-1 cadence] 거래일 정규화 채택.** cron이 만든 주말·공휴일 행(KST 토/일 + 직전 거래일과 `price` 동일·`changeRate==0` 연속행)을 판정 시 제거해 시계열을 **"거래일만"** 으로 통일한다. 백필도 거래일 series만 적재 → 양쪽 cadence 일치. `N`/`M`/`buffer`는 모두 **거래일** 단위로 해석(N=60≈3개월). (해소: C-1)
2. **[D-2 백필] 로컬 일회성 node 스크립트(`scripts/`) 채택.** Supabase 직접 적재, Yahoo chart `high` 배열로 롤링 252 거래일 max 계산, KST 자정 정규화, `skipDuplicates`로 라이브 행 보존. Vercel 엔드포인트/cron 미사용(60s 회피). (해소: C-2·C-3·C-5)
3. **[D-3 돌파 정의] "신규 신고가 경신"만 인정.** `isBreakout`에 **`price(breakoutDate) > max(price(d) for d in quiet)`** 조건 추가(실제 상승 확인). `tolerance`(0.5%)는 근접 재터치 허용이 아니라 **측정/반올림 오차 흡수 용도**로만 사용. (해소: C-4)
4. **[D-4 조정 깊이] `quietMaxRatio` 기본 80%, 고급 설정에서 사용자 조정 가능**(노출은 §8.4 "고급 설정" 접힘 안). 고점 대비 **20% 이상 조정**한 종목만 quiet로 인정 → 얕은 눌림이 아닌 의미 있는 조정 후 돌파에 집중. 범위 60~95%.

> 위 결정으로 §3 알고리즘 의사코드는 다음을 반영해 갱신한다: (a) series를 거래일로 정규화, (b) `isBreakout = breakoutRecently AND quietOK AND price(breakoutDate) > priorMaxPrice`, (c) `priorMaxPrice = max(price(d) for d in quiet)`. AC-QUIET-BOUNDARY·AC-CONSOLIDATION-NOFLOOR·AC-PRIORMAX-UNIT·AC-NULL-SORT·AC-SPLIT-WARNING은 그대로 적용.
