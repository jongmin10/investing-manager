/**
 * 목표 수익률 역산 엔진 (순수 함수 — 서버 API와 클라이언트 미리보기가 공유)
 *
 * 설계: docs/target-return-etf-recommendation-design.md §5
 *  - 6개 앵커(성향 5종 + 상한 5/0/25/70)의 조각별 선형 보간 축 t ∈ [0,5]
 *  - solve-R(t): equity CAGR도 t에 대해 연속 보간 → R(t)는 단조 연속(구간 내 이차항 포함).
 *    닫힌형 대신 이분법으로 역산한다(수치적으로 단순·견고).
 *  - display-R: 최종 정수 배분 × round(t) 앵커 ETF 세트로 재계산한 표시용 기대수익.
 *    display-R < target이면 t를 +0.1씩 상향해 "표시 기대수익 ≥ 목표" 불변식을 보장한다.
 *  - 불변식: 합계 100 · 전 항목 ≥ 0 · equity ≤ MAX_EQUITY_PCT(70) ·
 *    (achievable=true) display-R ≥ target — vitest property 테스트로 검증.
 */
import {
  Allocation,
  RiskType,
  BASE_ALLOCATION,
  MAX_EQUITY_PCT,
  RISK_TYPE_ORDER,
  ClassCagrs,
} from "./portfolio";

/** 혼합형 look-through 주식 환산 계수.
 *  TDF2030 글라이드패스 주식 ~45% × 60% + 주식30%혼합 × 40% ≈ 0.39 → 0.4 근사.
 *  BASE_ALLOCATION 주석의 성향별 실효 주식 비중과 정합해야 한다. */
export const MIXED_EQUITY_RATIO = 0.4;

/** 자산군별 예상 최대 낙폭(%) — 미리보기·근거 표시용 추정 상수 (설계 §5.4) */
export const CLASS_MDD: Record<keyof Allocation, number> = {
  guaranteed: 0,
  bond: 8,
  mixed: 20,
  equity: 45,
};

// t=5 상한 앵커 — 위험자산 70% 한도 포트폴리오 (설계 §5.1 확정: 5/0/25/70)
const CAP_ANCHOR: Allocation = { guaranteed: 5, bond: 0, mixed: 25, equity: 70 };

const ANCHORS: Allocation[] = [
  ...RISK_TYPE_ORDER.map((rt) => BASE_ALLOCATION[rt]),
  CAP_ANCHOR,
];
const T_MAX = ANCHORS.length - 1; // 5

// 앵커 간 기대수익 간격이 이보다 작으면(역전 포함) 역산 불능으로 판정 (%p)
const MONOTONE_EPS = 0.01;

export type TargetMode = "guaranteed" | "interpolated" | "capped" | "fallback";

export interface TargetSolveResult {
  allocation: Allocation;
  /** 표시용 기대수익(연 %, 소수 1자리) — 반올림 배분 × round(t) 앵커 세트 기준 */
  expectedRate: number;
  effectiveEquityPct: number;
  estimatedMddPct: number;
  nearestRiskType: RiskType;
  /** 사용자 성향 대비 초과 위험 단계 (0 = 적합, riskType null이면 0) */
  riskGap: number;
  mode: TargetMode;
  achievable: boolean;
  /** R(0..5) — 앵커별 기대수익(연 %, 소수 2자리). UI 참고용 */
  anchorR: number[];
  feasibleRange: { min: number; max: number };
}

const ALLOC_KEYS: (keyof Allocation)[] = ["guaranteed", "bond", "mixed", "equity"];

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** t의 실수 배분 (앵커 조각별 선형 보간) */
function allocationAt(t: number): Record<keyof Allocation, number> {
  const k = Math.min(Math.floor(t), T_MAX - 1);
  const f = t - k;
  const lo = ANCHORS[k];
  const hi = ANCHORS[k + 1];
  return {
    guaranteed: lerp(lo.guaranteed, hi.guaranteed, f),
    bond: lerp(lo.bond, hi.bond, f),
    mixed: lerp(lo.mixed, hi.mixed, f),
    equity: lerp(lo.equity, hi.equity, f),
  };
}

/** t의 equity CAGR — 연속 보간. t ∈ [4,5]는 공격투자형 세트로 상수 */
function equityCagrAt(t: number, c: ClassCagrs): number {
  const i = Math.min(Math.floor(t), 4);
  const j = Math.min(Math.ceil(t), 4);
  return lerp(c.equityByAnchor[i], c.equityByAnchor[j], t - Math.floor(t));
}

/** solve-R(t): 연속 기대수익 (%) */
function continuousR(t: number, c: ClassCagrs): number {
  const a = allocationAt(t);
  return (
    (a.guaranteed * c.guaranteed +
      a.bond * c.bond +
      a.mixed * c.mixed +
      a.equity * equityCagrAt(t, c)) /
    100
  );
}

/** display-R: 정수 배분 × 앵커(nearest) equity 세트 기준 기대수익 (%) */
function displayR(alloc: Allocation, nearestIdx: number, c: ClassCagrs): number {
  return (
    (alloc.guaranteed * c.guaranteed +
      alloc.bond * c.bond +
      alloc.mixed * c.mixed +
      alloc.equity * c.equityByAnchor[nearestIdx]) /
    100
  );
}

/** 실수 배분 → 정수 배분: 반올림 → 잔차를 최대 자산군에 흡수 → equity 70 클램프 (설계 §5.3-7) */
function roundAllocation(raw: Record<keyof Allocation, number>): Allocation {
  const alloc: Allocation = {
    guaranteed: Math.round(raw.guaranteed),
    bond: Math.round(raw.bond),
    mixed: Math.round(raw.mixed),
    equity: Math.round(raw.equity),
  };
  const diff = 100 - ALLOC_KEYS.reduce((s, k) => s + alloc[k], 0);
  if (diff !== 0) {
    const largest = ALLOC_KEYS.reduce((a, b) => (alloc[a] >= alloc[b] ? a : b));
    alloc[largest] = Math.max(0, alloc[largest] + diff);
  }
  if (alloc.equity > MAX_EQUITY_PCT) {
    alloc.guaranteed += alloc.equity - MAX_EQUITY_PCT;
    alloc.equity = MAX_EQUITY_PCT;
  }
  return alloc;
}

function buildResult(
  alloc: Allocation,
  nearestIdx: number,
  t: number,
  c: ClassCagrs,
  riskType: RiskType | null,
  mode: TargetMode,
  achievable: boolean,
  anchorR: number[]
): TargetSolveResult {
  const expected = displayR(alloc, nearestIdx, c);
  const riskIdx = riskType ? RISK_TYPE_ORDER.indexOf(riskType) : -1;
  // riskGap: 목표가 요구하는 위험 단계(ceil(t), 상한 앵커는 공격투자형으로 캡) − 사용자 성향
  const requiredIdx = Math.min(Math.ceil(t - 1e-9), 4);
  return {
    allocation: alloc,
    expectedRate: round1(expected),
    effectiveEquityPct: Math.round(alloc.equity + alloc.mixed * MIXED_EQUITY_RATIO),
    estimatedMddPct: round1(
      ALLOC_KEYS.reduce((s, k) => s + (alloc[k] * CLASS_MDD[k]) / 100, 0)
    ),
    nearestRiskType: RISK_TYPE_ORDER[nearestIdx],
    riskGap: riskIdx >= 0 ? Math.max(0, requiredIdx - riskIdx) : 0,
    mode,
    achievable,
    anchorR: anchorR.map(round2),
    feasibleRange: { min: round1(c.guaranteed), max: round1(anchorR[T_MAX]) },
  };
}

/**
 * 목표 수익률 → 최소 위험 자산 배분 역산 (설계 §5.3)
 *
 * @param targetRateInput 연 목표 수익률(%). 소수 1자리로 반올림 정규화된다.
 * @param c getClassCagrs(returnMap) 산출값
 * @param riskType 사용자 진단 성향 (riskGap 계산용, null 허용)
 * @throws RangeError targetRateInput이 유한 양수가 아닐 때 (API 검증과 이중 방어)
 */
export function solveTargetAllocation(
  targetRateInput: number,
  c: ClassCagrs,
  riskType: RiskType | null
): TargetSolveResult {
  if (!Number.isFinite(targetRateInput) || targetRateInput <= 0) {
    throw new RangeError(`invalid target rate: ${targetRateInput}`);
  }
  // §5.3-0: 소수 1자리 round-half-up 정규화 (4.95 → 5.0)
  const target = round1(targetRateInput);

  const anchorR = Array.from({ length: T_MAX + 1 }, (_, k) => continuousR(k, c));

  // §5.3-2: 단조성 검증 — 위반 시 성향 기반 배분으로 안전 fallback
  for (let k = 0; k < T_MAX; k++) {
    if (anchorR[k + 1] - anchorR[k] < MONOTONE_EPS) {
      const rt = riskType ?? "MODERATE";
      const idx = RISK_TYPE_ORDER.indexOf(rt);
      const alloc = { ...BASE_ALLOCATION[rt] };
      const res = buildResult(alloc, idx, idx, c, riskType, "fallback", false, anchorR);
      res.achievable = res.expectedRate >= target;
      return res;
    }
  }

  // §5.3-3: 보장 특례
  if (target <= c.guaranteed) {
    return buildResult(
      { guaranteed: 100, bond: 0, mixed: 0, equity: 0 },
      0, 0, c, riskType, "guaranteed", true, anchorR
    );
  }

  // §5.3-4~6: t 결정
  let t: number;
  let mode: TargetMode = "interpolated";
  let achievable = true;
  if (target <= anchorR[0]) {
    t = 0; // 데드존 (2.3, R(0)]: 안정형 배분 (기대 R(0) ≥ target)
  } else if (target > anchorR[T_MAX]) {
    t = T_MAX;
    mode = "capped";
    achievable = false;
  } else {
    let k = 0;
    while (k < T_MAX - 1 && anchorR[k + 1] < target) k++;
    // 이분법: continuousR는 단조 연속(앵커 검증 통과), [k, k+1]이 target을 감싼다
    let lo = k;
    let hi = k + 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (continuousR(mid, c) < target) lo = mid;
      else hi = mid;
    }
    t = hi;
  }

  // §5.3-7~9: 반올림 배분 + display-R ≥ target 보정 루프
  let alloc = roundAllocation(allocationAt(t));
  let nearestIdx = Math.min(Math.round(t), 4);
  if (achievable) {
    for (let guard = 0; guard < 60; guard++) {
      if (displayR(alloc, nearestIdx, c) + 1e-9 >= target || t >= T_MAX) break;
      t = Math.min(T_MAX, t + 0.1);
      alloc = roundAllocation(allocationAt(t));
      nearestIdx = Math.min(Math.round(t), 4);
    }
    // 상한까지 올려도 미달이면(반올림 손실 등) 정직하게 미달 표기
    achievable = displayR(alloc, nearestIdx, c) + 1e-9 >= target;
  }

  return buildResult(alloc, nearestIdx, t, c, riskType, mode, achievable, anchorR);
}
