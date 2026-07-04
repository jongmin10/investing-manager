/**
 * 포트폴리오 API 응답 빌더 (서버 전용)
 *
 * GET /api/portfolio 와 PUT/DELETE /api/portfolio/target 이 동일 페이로드를 반환하도록
 * 조립 로직을 공유한다. (설계: docs/target-return-etf-recommendation-design.md §6)
 *
 * 배분 모드:
 *  - RISK_TYPE (targetReturn null): 성향 앵커 + 시장 신호 조정 (현행 동작)
 *  - TARGET   (targetReturn 설정): solveTargetAllocation 역산 배분. 시장 신호는
 *    배분에 적용하지 않고 정보로만 반환한다 (N4 — 목표↔기대수익 계약의 결정성 보존).
 */
import { prisma } from "@/lib/prisma";
import {
  RiskType,
  Allocation,
  EtfGroup,
  MarketSignal,
  applySignals,
  getMarketSignals,
  buildEtfRecommendations,
  getClassCagrs,
  BASE_ALLOCATION,
  RISK_TYPE_LABEL,
  RISK_TYPE_DESC,
  GUARANTEED_CAGR,
} from "@/lib/portfolio";
import { getEtfReturnMap } from "@/lib/etf-returns";
import {
  solveTargetAllocation,
  getAnchorR,
  TargetMode,
} from "@/lib/target-allocation";

export interface PortfolioResponse {
  riskType: RiskType;
  riskTypeLabel: string;
  riskTypeDesc: string;
  allocation: Allocation;
  baseAllocation: Allocation;
  signals: MarketSignal[];
  indicators: {
    vix: number | null; cpi: number | null; usCpi: number | null;
    cli: number | null; sp500Change: number | null;
  };
  missingIndicators: string[];
  etfGroups: EtfGroup[];
  // ── v2: 목표 수익률 모드 ──
  allocationSource: "RISK_TYPE" | "TARGET";
  targetReturn: number | null;
  /** 현재 allocation 기준 연 예상 수익률(%, 소수1) — 성향 카드 표시값.
   *  수익률 분석 탭의 포트폴리오 CAGR과 동일 산식(etfGroups 가중). */
  expectedAnnualReturn: number;
  riskGap: number;
  mode: TargetMode | null;       // TARGET 모드에서만 non-null
  achievable: boolean;
  targetSolver: {
    classCagr: { guaranteed: number; bond: number; mixed: number; equityByAnchor: number[] };
    anchorR: number[];
    feasibleRange: { min: number; max: number };
    basis: "db" | "fallback";
  };
  updatedAt: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** etfGroups 가중 연 수익률(%) — page.tsx 수익률 분석 탭의 portfolioCagr와 동일 산식 */
function weightedAnnualReturn(groups: EtfGroup[]): number {
  let sum = 0;
  for (const g of groups) {
    if (g.isGuaranteed) sum += (g.allocationPct / 100) * GUARANTEED_CAGR;
    else for (const e of g.etfs) sum += (e.portfolioPct / 100) * e.cagr;
  }
  return round1(sum);
}

/** 사용자 포트폴리오 응답 조립. 성향 프로필이 없으면 null (라우트에서 404). */
export async function buildPortfolioResponse(userId: string): Promise<PortfolioResponse | null> {
  const profile = await prisma.riskProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  // ── 지표 조회 (결측은 null — 신호 오발동 방지, 기존 로직 유지) ──
  const indicatorTypes = ["VIX", "CPI", "US_CPI", "CLI", "SP500"];
  const latestRecords = await Promise.all(
    indicatorTypes.map((type) =>
      prisma.indicatorRecord.findMany({
        where: { type },
        orderBy: { recordedAt: "desc" },
        take: 2,
      })
    )
  );

  const get = (i: number): number | null => latestRecords[i][0]?.value ?? null;
  const getChange = (i: number): number | null => {
    const [cur, prev] = latestRecords[i];
    if (!cur || !prev || prev.value === 0) return null;
    return ((cur.value - prev.value) / prev.value) * 100;
  };

  // SP500 두 레코드 간격이 정상 1거래일 범위(주말·공휴일 감안 4일)를 초과하면
  // "전일 대비"가 아니므로 신호 계산에서 제외한다 (과민 SP500_DROP 방지).
  const SP500_MAX_GAP_DAYS = 4;
  const getChangeWithGapGuard = (i: number): number | null => {
    const change = getChange(i);
    if (change === null) return null;
    const [cur, prev] = latestRecords[i];
    const gapDays =
      (cur.recordedAt.getTime() - prev.recordedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (gapDays > SP500_MAX_GAP_DAYS) return null;
    return change;
  };

  const indicators = {
    vix: get(0),
    cpi: get(1),
    usCpi: get(2),
    cli: get(3),
    sp500Change: getChangeWithGapGuard(4),
  };
  const missingIndicators = (
    Object.entries(indicators) as [string, number | null][]
  )
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  // ── 배분 산출 ──
  const riskType = profile.riskType as RiskType;
  const signals = getMarketSignals(indicators);
  const baseAllocation = BASE_ALLOCATION[riskType];

  const returnMap = await getEtfReturnMap();
  const classCagr = getClassCagrs(returnMap);
  const anchorR = getAnchorR(classCagr);
  const basis: "db" | "fallback" = Object.keys(returnMap).length === 0 ? "fallback" : "db";

  const targetReturn = profile.targetReturn ?? null;
  let allocation: Allocation;
  let etfRiskType: RiskType = riskType;
  let riskGap = 0;
  let mode: TargetMode | null = null;
  let achievable = true;

  if (targetReturn !== null) {
    const solve = solveTargetAllocation(targetReturn, classCagr, riskType);
    allocation = solve.allocation;
    etfRiskType = solve.nearestRiskType;
    riskGap = solve.riskGap;
    mode = solve.mode;
    achievable = solve.achievable;
  } else {
    allocation = applySignals(riskType, signals);
  }

  const etfGroups = buildEtfRecommendations(etfRiskType, allocation, returnMap);

  return {
    riskType,
    riskTypeLabel: RISK_TYPE_LABEL[riskType],
    riskTypeDesc: RISK_TYPE_DESC[riskType],
    allocation,
    baseAllocation,
    signals,
    indicators,
    missingIndicators,
    etfGroups,
    allocationSource: targetReturn !== null ? "TARGET" : "RISK_TYPE",
    targetReturn,
    expectedAnnualReturn: weightedAnnualReturn(etfGroups),
    riskGap,
    mode,
    achievable,
    targetSolver: {
      classCagr: {
        guaranteed: classCagr.guaranteed,
        bond: round2(classCagr.bond),
        mixed: round2(classCagr.mixed),
        equityByAnchor: classCagr.equityByAnchor.map(round2),
      },
      anchorR,
      feasibleRange: { min: round1(classCagr.guaranteed), max: anchorR[anchorR.length - 1] },
      basis,
    },
    updatedAt: new Date().toISOString(),
  };
}
