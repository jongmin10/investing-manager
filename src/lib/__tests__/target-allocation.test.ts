/**
 * solveTargetAllocation 단위·property 테스트
 * 설계: docs/target-return-etf-recommendation-design.md §10.1
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { solveTargetAllocation, TargetSolveResult } from "../target-allocation";
import {
  getClassCagrs,
  ClassCagrs,
  BASE_ALLOCATION,
  RISK_TYPE_ORDER,
  MAX_EQUITY_PCT,
  GUARANTEED_CAGR,
  Allocation,
} from "../portfolio";

// 빈 returnMap → FALLBACK_ETF_RETURNS 사용 (결정적 기준 데이터)
const C: ClassCagrs = getClassCagrs({});

const sum = (a: Allocation) => a.guaranteed + a.bond + a.mixed + a.equity;

function assertInvariants(r: TargetSolveResult) {
  expect(sum(r.allocation)).toBe(100);
  for (const v of Object.values(r.allocation)) expect(v).toBeGreaterThanOrEqual(0);
  expect(r.allocation.equity).toBeLessThanOrEqual(MAX_EQUITY_PCT);
  expect(RISK_TYPE_ORDER).toContain(r.nearestRiskType);
}

describe("특례·경계", () => {
  it("target ≤ 보장수익률 → 보장 100%", () => {
    const r = solveTargetAllocation(2.0, C, "MODERATE");
    expect(r.mode).toBe("guaranteed");
    expect(r.allocation).toEqual({ guaranteed: 100, bond: 0, mixed: 0, equity: 0 });
    expect(r.expectedRate).toBe(GUARANTEED_CAGR);
    expect(r.riskGap).toBe(0);
    assertInvariants(r);
  });

  it("데드존 (보장수익률, R(0)] → 안정형 배분", () => {
    const r = solveTargetAllocation(2.5, C, "CONSERVATIVE");
    expect(r.mode).toBe("interpolated");
    expect(r.allocation).toEqual(BASE_ALLOCATION.CONSERVATIVE);
    expect(r.expectedRate).toBeGreaterThanOrEqual(2.5);
    expect(r.riskGap).toBe(0);
    assertInvariants(r);
  });

  it("target = R(0) 정확 일치 → 안정형 배분 (구간 탐색 실패 없음)", () => {
    const r0 = solveTargetAllocation(3, C, null).anchorR[0];
    const r = solveTargetAllocation(r0, C, null);
    expect(r.achievable).toBe(true);
    assertInvariants(r);
  });

  it("달성 불가 목표 → capped + 상한 배분 (5/0/25/70)", () => {
    const r = solveTargetAllocation(50, C, "MODERATE");
    expect(r.mode).toBe("capped");
    expect(r.achievable).toBe(false);
    expect(r.allocation).toEqual({ guaranteed: 5, bond: 0, mixed: 25, equity: 70 });
    expect(r.nearestRiskType).toBe("VERY_AGGRESSIVE");
    assertInvariants(r);
  });

  it("소수 정규화: 4.95는 5.0으로 round-half-up", () => {
    const a = solveTargetAllocation(4.95, C, null);
    const b = solveTargetAllocation(5.0, C, null);
    expect(a.allocation).toEqual(b.allocation);
  });

  it("유한 양수가 아닌 입력은 RangeError", () => {
    expect(() => solveTargetAllocation(NaN, C, null)).toThrow(RangeError);
    expect(() => solveTargetAllocation(0, C, null)).toThrow(RangeError);
    expect(() => solveTargetAllocation(-3, C, null)).toThrow(RangeError);
    expect(() => solveTargetAllocation(Infinity, C, null)).toThrow(RangeError);
  });
});

describe("riskGap 적합성", () => {
  it("성향 이내 목표는 gap 0, 초과 목표는 단계 수만큼", () => {
    // 현재 데이터 기준 R ≈ [2.9, 3.6, 6.2, 7.9, 11.2, 12.5]
    expect(solveTargetAllocation(5.0, C, "MODERATE").riskGap).toBe(0);   // t ∈ (1,2]
    expect(solveTargetAllocation(7.0, C, "MODERATE").riskGap).toBe(1);   // t ∈ (2,3]
    expect(solveTargetAllocation(11.0, C, "MODERATE").riskGap).toBe(2);  // t ∈ (3,4]
    expect(solveTargetAllocation(11.0, C, "VERY_AGGRESSIVE").riskGap).toBe(0);
    expect(solveTargetAllocation(11.0, C, null).riskGap).toBe(0);        // 미진단
  });
});

describe("단조성·기대수익", () => {
  it("목표가 높을수록 주식 비중이 줄지 않는다", () => {
    let prevEquity = -1;
    for (let rate = 3; rate <= 12; rate += 0.5) {
      const r = solveTargetAllocation(rate, C, null);
      expect(r.allocation.equity).toBeGreaterThanOrEqual(prevEquity);
      prevEquity = r.allocation.equity;
    }
  });

  it("feasibleRange.min은 보장수익률", () => {
    const r = solveTargetAllocation(5, C, null);
    expect(r.feasibleRange.min).toBe(GUARANTEED_CAGR);
    expect(r.feasibleRange.max).toBeGreaterThan(10);
  });
});

describe("방어 (역전·무효 데이터)", () => {
  it("앵커 기대수익 역전 시 성향 배분으로 fallback", () => {
    // equity CAGR이 위험 단계와 반대로 급감 → R(1) > R(2) 역전 유도
    const broken: ClassCagrs = {
      guaranteed: 2.3,
      bond: 10,
      mixed: 1,
      equityByAnchor: [30, 25, 3, 1, 0],
    };
    const r = solveTargetAllocation(6, broken, "AGGRESSIVE");
    expect(r.mode).toBe("fallback");
    expect(r.allocation).toEqual(BASE_ALLOCATION.AGGRESSIVE);
    assertInvariants(r);
  });

  it("무효 수익률 데이터(cum ≤ -100, years ≤ 0)는 fallback 값으로 대체되어 NaN이 없다", () => {
    const c = getClassCagrs({
      SP500: { cumulativeReturn: -150, returnYears: 20, returnPeriod: "-" },
      국채3년: { cumulativeReturn: 31, returnYears: 0, returnPeriod: "-" },
    });
    expect(Number.isFinite(c.bond)).toBe(true);
    for (const v of c.equityByAnchor) expect(Number.isFinite(v)).toBe(true);
    const r = solveTargetAllocation(6, c, "MODERATE");
    expect(Number.isFinite(r.expectedRate)).toBe(true);
    assertInvariants(r);
  });
});

describe("property: rate 0.1~50 스윕 불변식", () => {
  it("합계 100 · 전 항목 ≥ 0 · equity ≤ 70 · 유효 성향 · achievable ⇒ 기대 ≥ 목표", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.option(fc.constantFrom(...RISK_TYPE_ORDER), { nil: null }),
        (rate, riskType) => {
          const r = solveTargetAllocation(rate, C, riskType);
          const target = Math.round(rate * 10) / 10;
          assertInvariants(r);
          if (r.achievable) {
            // expectedRate는 소수1 반올림, target도 소수1 그리드 → ≥ 비교 성립
            expect(r.expectedRate).toBeGreaterThanOrEqual(target);
          }
          expect(r.riskGap).toBeGreaterThanOrEqual(0);
          expect(r.riskGap).toBeLessThanOrEqual(4);
        }
      ),
      { numRuns: 500 }
    );
  });
});
