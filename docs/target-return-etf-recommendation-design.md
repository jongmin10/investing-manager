# 목표 수익률 기반 자산배분 — 기능 설계서 v2

> 상태: **설계 v2 · 구현 대기** · v1 2026-07-04 → v2 2026-07-04 개정
>
> **v2 변경 요약**
> 1. **UI 방향 전환(사용자 결정)**: 별도 탭/섹션이 아니라 **"나의 투자 성향" 카드에 통합**.
>    카드에 현재 배분의 연 예상 수익률을 상시 표시하고, 카드 내에서 목표 수익률을 설정한다.
> 2. **목표 설정 = 플래너 전역 상태**: 목표를 저장하면 4개 탭(자산 배분·ETF 추천·수익률 분석·리밸런싱)
>    전체가 목표 기반 배분으로 전환된다. → v1의 stateless 결론 폐기, **DB 저장 필수**.
> 3. **4-에이전트 설계 검토(javis·super·wonder·sam) 반영**: 역산 알고리즘 재설계(계단 모순 해소·목표
>    미달 방지), 데드존·인덱스 클램프·단조성 가드, Vitest 도입, 상태별 UI 명세.
>
> ⚠️ 이 문서는 설계이며 **코드 변경은 포함하지 않는다(구현은 추후)**.

---

## 1. 개요

플래너에 **배분 모드** 개념을 도입한다.

| 모드 | 배분 산출 | 시장 신호 | 트리거 |
|------|----------|----------|--------|
| `RISK_TYPE` (기본, 현행) | 성향 앵커 + `applySignals` | 배분에 적용 (현행 유지) | 성향 진단 |
| `TARGET` (신규) | 목표 수익률 역산 (§5) | **배분 미적용, 정보 배너만** | 사용자가 목표 저장 |

- 성향 카드에 **현재 배분의 연 예상 수익률**을 항상 표시한다 (모드 무관).
  값은 수익률 분석 탭의 포트폴리오 CAGR과 **동일 산식·동일 소스**(etfGroups 가중 CAGR)여야 한다 — 탭 간 수치 불일치 금지.
- `TARGET` 모드에서 신호를 배분에 적용하지 않는 이유: 목표↔기대수익 계약의 결정성 보존
  (검토 확정 — super: "아키텍처적으로 옳은 결정").

핵심 원칙(v1 유지): 최소 위험 우선 / 위험자산 70% 한도 / 적합성 가드 / 과거 20년 기준 정직 표기.

## 2. 사용자 시나리오

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| S1 | 성향 카드 확인 | "위험중립형 · 연 예상 수익률 6.2% (과거 20년 기준)" 상시 표시 |
| S2 | 목표 7% 설정·저장 | 실시간 미리보기 → [적용] → 4탭 전체가 목표 배분으로 갱신, 카드에 "목표 연 7.0% 적용 중" |
| S3 | 성향보다 높은 목표 (riskGap≥1) | 경고 배지. **riskGap≥2는 적용 전 확인 모달** |
| S4 | 달성 불가 목표 (>R(5)≈12.5%) | "최대 기대수익 연 N%" 안내(red) + 상한 배분 제시, `achievable=false` |
| S5 | 하한 목표 (≤2.3%) | "원리금보장만으로 달성 가능" 안내 + 보장 100% 배분 (`mode:"guaranteed"`) |
| S6 | 목표 해제 | `RISK_TYPE` 모드 복귀, 4탭 성향 기반으로 환원 |
| S7 | 목표 적용 중 성향 재진단 | 목표 유지 + riskGap 재평가, 변동 시 카드에 경고 갱신 (§12-a) |
| S8 | 성향 미진단 사용자 | noProfile 화면(현행)이라 카드 자체가 없음 → 기능 미노출로 자연 해결 (v1의 S5 가드 불필요) |

## 3. 요구사항

### 기능
- F1. 성향 카드에 연 예상 수익률 표시 (현재 적용 중 배분 기준, 소수 1자리, "과거 20년 기준" 병기).
- F2. 카드 내 목표 설정 UI: 슬라이더(0.5% 스텝) + 숫자 입력 동기화, **실시간 미리보기**(배분 4종·기대수익·예상 낙폭·riskGap).
- F3. [적용] 시 저장 → 4탭 전체 반영. [해제] 시 성향 기반 복귀. 새로고침·재방문 후에도 유지.
- F4. 적합성 가드: riskGap 표시, riskGap≥2 확인 모달 (비차단).
- F5. 리밸런싱·수익률 분석·ETF 추천은 별도 작업 없이 자동 반영 (`data.allocation`/`etfGroups` 소비 구조 활용).

### 비기능
- N1. 기대수익 파라미터는 EtfReturn DB에서 산출, 하드코딩 금지 (recalc 자동 반영).
- N2. 불변식: 배분 합계 100 · 전 항목 ≥ 0 · **equity ≤ 70** · (achievable=true일 때) **표시 기대수익 ≥ 목표**.
- N3. **데이터 소스 단일화**: 성향 카드·전 탭이 동일 returnMap(서버 조립 etfGroups) 사용. page.tsx의 `getEtfRecommendations`(fallback 동기 경로) 잔존 사용을 이번 작업에서 제거.
- N4. TARGET 모드에서 시장 신호는 배분 미적용 — 신호 배너는 유지하되 "정보 제공(배분 미반영)" 명시.
- N5. 실시간 미리보기는 **클라이언트 계산**(§6): 슬라이더 조작 중 서버 왕복 없음 (검토 권고 채택 — race condition·레이턴시 원천 제거).

## 4. 상태·데이터 모델

```prisma
model RiskProfile {
  // ...기존 필드...
  targetReturn Float?   // 연 목표 수익률(%). null = RISK_TYPE 모드
}
```

- 라이브 DB는 PostgreSQL(Supabase) — 반영은 `prisma db push` (마이그레이션 폴더 없음, 검토 확인).
- nullable 컬럼 1개 추가라 기존 row·API 무영향. 쓰기 경로는 PUT/DELETE 단건 update뿐.

## 5. 역산 알고리즘 (v2 — 검토 결함 수정 반영)

### 5.1 위험 축

6개 앵커의 조각별 선형 보간 축 t ∈ [0, 5] (v1 동일). t=5 상한 앵커는 **5/0/25/70** 확정
(대안 0/5/25/70과 기대수익 차 0.017%p로 무의미, guaranteed 곡선의 단조 연속성 우선 — super 검증).

```
t=0 안정형 70/20/10/0 · t=1 안정추구 50/30/15/5 · t=2 위험중립 20/30/25/25
t=3 적극 15/20/30/35 · t=4 공격 5/10/25/60 · t=5 상한 5/0/25/70
```

### 5.2 solve-R과 display-R의 분리 (v1 결함 D1 수정)

v1은 "닫힌형 선형 역산"과 "equity CAGR은 round(t) 앵커 세트"를 병용했으나, 반올림 계단이
구간 중앙(t=k+0.5)에 생겨 선형이 아니게 되고 **목표 미달 배분**(예: 목표 9.5% → 실제 9.18%)이
산출되는 결함이 확인됐다. v2는 두 함수를 분리한다:

- **solve-R(t)**: equity CAGR도 t에 대해 **연속 선형 보간** → R(t)가 완전한 조각별 선형·연속.
  닫힌형 구간 역산 유지 가능.
- **display-R(alloc)**: 최종 정수 배분 × `nearestRiskType` ETF 세트로 재계산한 표시용 기대수익.
- **보정 루프**: display-R < target 이면 t를 +0.1씩 상향해 재산출 (최대 t=5).
  → N2의 "표시 기대수익 ≥ 목표" 불변식 보장. UI에는 항상 display-R을 노출.

### 5.3 절차

```
입력: target(%), riskType, returnMap
0. 정규화: target을 소수 1자리로 반올림(round-half-up — 4.95 → 5.0. truncate 금지, M6)
1. 자산군 수익률 산출: r_g = GUARANTEED_CAGR, r_bond/r_mixed = weightInClass 가중,
   r_eq(anchor) 5종 + 상한 앵커는 VERY_AGGRESSIVE 세트
   방어: cumulativeReturn ≤ -100 또는 returnYears ≤ 0 인 키는 무효 → fallback 값으로 대체 (M1·M2)
2. 앵커 R(0..5) 산출 후 단조성 검증: R(k) < R(k+1) 위반 또는 R(k+1)−R(k) < ε 이면
   → 역산 중단, RISK_TYPE 배분으로 안전 fallback + 서버 로그 (H2/D4)
3. 특례: target ≤ r_g → 보장 100% (mode:"guaranteed")
4. 데드존: target ≤ R(0) → t*=0 (안정형 배분, 기대 R(0) ≥ target) (H3/D2)
5. 상한: target > R(5) → t*=5, achievable=false (mode:"capped")
6. 구간 역산: R(k) < target ≤ R(k+1) 인 k에서 t* = k + (target−R(k))/(R(k+1)−R(k))
7. 배분 산출: 보간(t*) → 정수 반올림 → 합계 100 보정(최대 자산군 잔차 흡수) → equity ≤ 70 클램프
8. nearestRiskType = RISK_TYPE_BY_INDEX[min(round(t*), 4)] (H1/D3 — 인덱스 5 클램프 필수.
   미클램프 시 byRisk[undefined] → 기본 ETF 세트로 조용히 폴백되는 함정)
9. display-R 재계산 → target 미달이며 achievable=true 이면 t* += 0.1 후 7부터 반복 (§5.2)
10. 산출물: allocation, expectedRate(display-R), effectiveEquityPct, estimatedMddPct,
    nearestRiskType, riskGap = max(0, ceil(t*) − riskTypeIndex), mode
```

### 5.4 파라미터 상수 (lib에 주석과 함께 정의)

- `MIXED_EQUITY_RATIO = 0.4` — 혼합형 look-through 주식 환산 계수 (TDF 글라이드패스·주식30%혼합 가중 근사,
  BASE_ALLOCATION 주석의 실효 비중과 정합) (D6)
- MDD 상수: 보장 0 / 채권 8 / 혼합 20 / 주식 45 (%) — §6 예시는 이 값으로 재계산 (D5: v1 예시 11%는 오기, 정답 14%)
- 실수 비교는 0단계 정규화(소수 1자리) 후 수행 — 엡실론 문제 회피 (L1)

**현재 데이터 기준 참고치**: R(0..5) ≈ 2.9 / 3.6 / 6.2 / 7.9 / 11.2 / 12.5%. 달성 가능 범위 = 2.3(보장 특례, 이산)
~ 12.5%. feasibleRange는 런타임 산출 — UI 슬라이더 범위에 사용.

## 6. API 설계

### 6.1 `GET /api/portfolio` (기존 확장)

```jsonc
{
  // ── 기존 필드 유지 ──
  "riskType": "MODERATE", "allocation": {...}, "baseAllocation": {...},
  "signals": [...], "etfGroups": [...],
  // ── v2 추가 ──
  "allocationSource": "TARGET",          // "RISK_TYPE" | "TARGET"
  "targetReturn": 7.0,                    // null = 미설정
  "expectedAnnualReturn": 7.1,            // 현재 allocation 기준 display-R (성향 카드 표시값)
  "riskGap": 1,                           // TARGET 모드에서만 >0 가능
  "mode": "interpolated",                 // "guaranteed" | "interpolated" | "capped" (TARGET 모드)
  "achievable": true,
  "targetSolver": {                       // 클라이언트 실시간 미리보기용 (N5)
    "classCagr": { "guaranteed": 2.3, "bond": 2.65, "mixed": 7.05, "equityByAnchor": [11.1,11.3,12.8,14.0,15.1] },
    "anchorR": [2.9, 3.6, 6.2, 7.9, 11.2, 12.5],
    "feasibleRange": { "min": 2.3, "max": 12.5 },
    "basis": "db"                         // "db" | "fallback" (returnMap 빈 맵 → fallback 판정, D7)
  }
}
```

- TARGET 모드일 때: `allocation` = §5 산출 결과(신호 미적용), `signals`는 그대로 반환하되
  프론트가 "배분 미반영" 표기 (N4). RISK_TYPE 모드는 현행 동작 그대로 (§12-b).

### 6.2 `PUT /api/portfolio/target` — 목표 저장

- Body `{ "rate": 7.0 }`. 검증: 수치, `isFinite`, `0 < rate ≤ 50`, 소수 1자리 반올림 (H/M6).
- `RiskProfile.targetReturn` 저장 후 **6.1과 동일한 전체 응답 반환** (한 왕복으로 4탭 갱신).
- 400: 검증 실패. 404: 성향 프로필 없음 (S8 — 진단 선행 필수).

### 6.3 `DELETE /api/portfolio/target` — 목표 해제

- `targetReturn = null` → RISK_TYPE 모드 복귀, 6.1 전체 응답 반환.

서버·클라이언트 모두 동일 lib 순수 함수(`solveTargetAllocation`)를 사용한다 — 미리보기(클라)와
저장 결과(서버)의 수치 일치 보장. 미리보기는 `targetSolver` 데이터로 로컬 계산하므로 슬라이더
조작 중 API 호출·AbortController가 불필요하다 (PUT 1회만 발생).

## 7. UI 설계 — 성향 카드 통합

### 7.1 카드 목업

```
── 미설정 (RISK_TYPE 모드) ──────────────────────────
┌ 나의 투자 성향 ──────────────────────────────────┐
│ 위험중립형                    연 예상 수익률 6.2% │
│ 수익과 안정의 균형을 추구합니다…   (과거 20년 기준) │
│ ─────────────────────────────────────────────── │
│ 🎯 목표 수익률로 배분 받기          [목표 설정 ▾] │
└──────────────────────────────────────────────────┘

── 설정 패널 확장 시 (카드 내 아코디언) ─────────────
│ 연 목표 수익률  [ 2.3 ●━━━○━━━━ 12.5 ]  [ 7.0 ]% │
│ ── 미리보기 (실시간, 클라 계산) ──                 │
│ 보장 12 / 채권 14 / 혼합 28 / 주식 46              │
│ 기대 연 7.1% · 예상 낙폭 ~26% · 실효 주식 ~57%     │
│ ⚠ 성향(위험중립형)보다 1단계 높은 위험입니다        │
│                            [취소]  [적용하기]      │
└──────────────────────────────────────────────────┘

── 적용 중 (TARGET 모드) ────────────────────────────
┌ 나의 투자 성향 ──────────────────────────────────┐
│ 위험중립형             목표 연 7.0% · 기대 연 7.1% │
│ 🎯 목표 수익률 적용 중 (과거 20년 기준)             │
│ ⚠ 성향보다 1단계 높은 위험      [수정]  [해제]     │
└──────────────────────────────────────────────────┘
```

### 7.2 상태별 명세 (wonder 검토 반영)

| 상태 | 명세 |
|------|------|
| 초기(미설정) | 예상 수익률은 성향 배분 기준으로 항상 표시. 설정 패널은 접힘. 카드 높이 고정으로 CLS 방지 |
| 설정 패널 확장 | `aria-expanded` 토글. 미리보기는 클라 계산이라 로딩 없음. 슬라이더 `aria-label="연 목표 수익률"`, `aria-valuemin/max/now`, `aria-valuetext="연 7.0%"` |
| riskGap≥1 | 패널 내 warning(amber) 배지, `role="alert"` (조건부 DOM 삽입 — display 토글 금지, 스크린리더 재공지) |
| riskGap≥2 적용 클릭 | 확인 모달: "성향보다 N단계 높은 위험을 감수하시겠습니까?" [재진단하기] [감수하고 적용] |
| S4 달성 불가 | 슬라이더가 max에서 멈추므로 원천 차단. 숫자 입력으로 초과 시 blur에서 max 클램프 + red 안내 "최대 기대수익은 연 12.5%입니다" |
| S5 보장 특례 | info(blue) 안내 "원리금보장 상품만으로 달성 가능합니다". 적용 시 배분 보장 100% |
| PUT 실패 | 패널 내 인라인 에러 "저장하지 못했습니다. 다시 시도하세요." + 재시도 버튼. 이전 상태 유지, 전체 화면 교체 금지 |
| 적용 성공 | 패널 접힘 → 카드 TARGET 모드 표기 → 4탭 데이터 갱신(응답으로 setData). 자산 배분 탭 배지 "목표 수익률 반영됨" (기존 "시장 신호 반영됨" 위치·스타일 재사용), 신호 배너에 "(배분 미반영)" 부기 |
| 해제 | DELETE → 성향 기반 응답으로 갱신, 카드 미설정 상태 복귀 |

- 숫자 입력은 기존 `AllocInput` 재사용 불가(정수 전용) — step 0.5·소수 1자리 지원 변형 필요 (wonder 지적).
- 4탭 구조는 **불변** — 기존 e2e 탭 검증 그대로 유효 (v1의 5탭 대비 v2 방향의 부수 이점).
- 자산 배분 탭 근거 카드: TARGET 모드에서는 `ALLOCATION_RATIONALE`(성향 고정문) 대신
  **동적 근거 3줄**(목표·실효 주식·낙폭·nearestRiskType 기준) 생성해 표시.
- 모바일(360·393px) 렌더링 Playwright 검증 필수 (프로젝트 규칙). 카드 확장 패널의 세로 공간만
  변동하므로 탭 라벨 이슈 없음.

## 8. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| EtfReturn DB 실패/빈 맵 | fallback 사용 + `basis:"fallback"` (판정: 맵 키 0개, D7). 미리보기·카드에 "기준 데이터: 예비값" 소형 표기 |
| CAGR 무효(cum ≤ −100, returnYears ≤ 0) | 해당 키 fallback 대체 (M1·M2) |
| 앵커 R 역전/평탄 | 역산 중단 → RISK_TYPE 배분 fallback + 로그 (H2). targetReturn은 유지(데이터 회복 시 재적용) |
| target = R(0) 정확 일치 | 데드존 절(§5.3-4)이 `≤`로 흡수 (H3) |
| round(t*) = 5 | min(…, 4) 클램프 (H1) |
| rate 4.95/4.999 입력 | round-half-up으로 5.0 정규화 (M6) |
| 재진단으로 riskType 변경 | targetReturn 유지, riskGap 재계산 — 카드 경고 갱신 (S7, §12-a) |
| 목표 적용 중 recalc로 CAGR 변동 | 다음 조회 시 동일 target으로 재역산 — 배분·기대수익이 이동할 수 있음을 §9 고지에 포함 |
| 성향 프로필 삭제(관리자) | targetReturn도 프로필과 함께 소멸 (같은 row) |

## 9. 규제·고지

- 카드·설정 패널 고정 고지: "기대수익·낙폭은 과거 20년 데이터 기반 추정치이며 미래 성과와 목표
  달성을 보장하지 않습니다. 기준 데이터 갱신 시 배분이 변동될 수 있습니다."
- riskGap 경고·확인 모달(§7.2)로 적합성 원칙 대응. 하드 차단 없음 (DC/IRP 자기운용 자율권).
- 위험자산 70% 한도는 모든 경로에서 클램프 (N2).

## 10. 테스트 계획

### 10.1 단위 — **Vitest + fast-check 도입** (sam 권고 채택, 러너 부재 해소)

```bash
npm i -D vitest fast-check
# package.json: "test:unit": "vitest run"
# 대상: src/lib/target-allocation.ts / 테스트: src/lib/__tests__/target-allocation.test.ts
```

- 왕복: 각 앵커 R 입력 → 해당 앵커 배분 복원
- 특례·경계: target ≤ 2.3 → 보장 100 / target = R(0) / target > R(5) → capped / rate 정규화(4.95→5.0)
- **property (fast-check, rate 0.1~50 스윕)**: 합계 100 · 전 항목 ≥ 0 · equity ≤ 70 ·
  nearestRiskType ∈ 유효 5종 · **achievable=true ⇒ display-R ≥ target** (v2 신규 불변식)
- 방어: 역전 returnMap 주입 → RISK_TYPE fallback / cum=−150·returnYears=0 주입 → NaN 미발생 /
  R 평탄(분모 ε) → fallback
- returnMap 변동 → feasibleRange 동조 (하드코딩 회귀 방지)

### 10.2 e2e (Playwright, 데스크톱+모바일)

- 카드에 연 예상 수익률 표시 (수익률 분석 탭 CAGR과 값 일치 확인)
- 목표 설정 → 적용: 자산 배분 탭 %·배지, ETF 추천 구성, **리밸런싱 목표값 수치 반영**(탭 전환만이 아니라 값 검증 — sam M3/F6)
- 해제 → 성향 배분 복귀 / 새로고침 후 목표 유지
- S4(max 클램프)·S5(보장 100%)·riskGap 경고/모달
- 기존 4탭 스펙 회귀 없음 (탭 구조 불변)

## 11. 확정 사항 (v1 미결정 5건 해소)

| # | 항목 | 결론 |
|---|------|------|
| 1 | 목표 저장 | **저장 필수** — v2 방향(전역 상태) 자체가 요구. `RiskProfile.targetReturn` |
| 2 | 적합성 경고 | 비차단 + **riskGap≥2 확인 모달** |
| 3 | 시장 신호 | TARGET 모드 배분 **미적용**(정보 배너만) |
| 4 | UI 위치 | **성향 카드 통합** (v2 방향 — 5탭 논쟁 소멸, wonder의 5탭 불가 판정과도 정합) |
| 5 | 상한 앵커 | **5/0/25/70** |

## 12. 확정 사항 (v2 — 2026-07-04 권장안 채택 확정)

- **(a) 재진단 시 목표 처리 → 유지 + riskGap 재평가**. 사용자가 명시 설정한 값을 암묵 삭제하지
  않는다. 재진단 후 성향 카드의 riskGap 경고가 새 성향 기준으로 갱신된다.
- **(b) RISK_TYPE 모드의 신호 조정 → 현행 유지**. 기존 사용자 경험·e2e 보존. 두 모드의 배지 문구
  ("시장 신호 반영됨" vs "목표 수익률 반영됨")로 차이를 명시.
- **(c) 설정 UI → 카드 내 아코디언 확장**. 모바일에서 모달 회피, 카드 문맥 유지.

## 13. 구현 순서 (착수 시)

1. `prisma db push` — `RiskProfile.targetReturn Float?` (next dev 중지 후 실행 — Windows EPERM 주의)
2. Vitest 도입 + `src/lib/target-allocation.ts` (`solveTargetAllocation` 순수 함수, §5) + 단위/property 테스트 — **PR 1**
3. API: GET 확장 + PUT/DELETE `/api/portfolio/target` + `getEtfRecommendations` fallback 경로 제거(N3) — **PR 2**
4. 성향 카드 UI(§7) + 자산 배분 탭 배지·동적 근거 + e2e — **PR 3** (frontend-ui-engineer)
5. 배포 후 프로덕션 검증 (e2e 계정 로그인 렌더링 패턴)

예상 규모: schema 1컬럼 + lib ~200줄 + route ~120줄 + UI ~300줄 + 테스트. PR 3개 분할 (javis 권고).
