import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  RiskType,
  applySignals,
  getMarketSignals,
  buildEtfRecommendations,
  BASE_ALLOCATION,
  RISK_TYPE_LABEL,
  RISK_TYPE_DESC,
} from "@/lib/portfolio";
import { getEtfReturnMap } from "@/lib/etf-returns";

// indicators.ts의 BASE_ALLOCATION은 src/lib/portfolio.ts에서 export 안했으므로 여기서 직접 사용
// applySignals에 이미 BASE_ALLOCATION이 내부적으로 포함됨

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.riskProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) return NextResponse.json({ error: "No risk profile" }, { status: 404 });

  // 현재 지표값 조회
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

  // 결측 시 0 fallback은 신호 오발동(예: CLI=0 → "경기 수축" 무조건 발동)을 일으키므로
  // 결측은 null로 반환한다. getMarketSignals는 null 지표 분기를 스킵한다.
  const get = (i: number): number | null => latestRecords[i][0]?.value ?? null;
  const getChange = (i: number): number | null => {
    const [cur, prev] = latestRecords[i];
    if (!cur || !prev || prev.value === 0) return null;
    return ((cur.value - prev.value) / prev.value) * 100;
  };

  // SP500 두 레코드의 recordedAt 간격(일)을 계산한다.
  // 주말·휴장·수집누락으로 prev가 며칠 전이면 "전일 대비"가 아닌 N일 누적 변화가 되어
  // SP500_DROP(-3%) 경고가 과민 발동한다. 정상 1거래일 범위(주말·공휴일 감안 4일 이내)를
  // 초과하면 sp500Change를 신호 계산에서 제외(null)하여 잘못된 "S&P500 급락" 경고를 막는다.
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

  // 값이 null인 지표 타입 목록(프론트가 "데이터 없음" 표기에 활용)
  const missingIndicators = (
    Object.entries(indicators) as [keyof typeof indicators, number | null][]
  )
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  const riskType = profile.riskType as RiskType;
  const signals = getMarketSignals(indicators);
  const allocation = applySignals(riskType, signals);
  const baseAllocation = BASE_ALLOCATION[riskType];

  // H5/L: ETF 수익률을 DB(EtfReturn)에서 조회해 서버에서 추천 조립 → 응답에 포함.
  // 프론트(page.tsx)는 이 etfGroups를 그대로 소비하면 된다(getEtfRecommendations 클라이언트 호출 대체).
  const etfReturnMap = await getEtfReturnMap();
  const etfGroups = buildEtfRecommendations(riskType, allocation, etfReturnMap);

  return NextResponse.json({
    riskType,
    riskTypeLabel: RISK_TYPE_LABEL[riskType],
    riskTypeDesc: RISK_TYPE_DESC[riskType],
    allocation,
    baseAllocation,
    signals,
    indicators,
    missingIndicators,
    etfGroups,
    updatedAt: new Date().toISOString(),
  });
}
