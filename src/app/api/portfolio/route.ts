import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  RiskType,
  applySignals,
  getMarketSignals,
  BASE_ALLOCATION,
  RISK_TYPE_LABEL,
  RISK_TYPE_DESC,
} from "@/lib/portfolio";

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

  const get = (i: number) => latestRecords[i][0]?.value ?? 0;
  const getChange = (i: number) => {
    const [cur, prev] = latestRecords[i];
    if (!cur || !prev || prev.value === 0) return 0;
    return ((cur.value - prev.value) / prev.value) * 100;
  };

  const indicators = {
    vix: get(0),
    cpi: get(1),
    usCpi: get(2),
    cli: get(3),
    sp500Change: getChange(4),
  };

  const riskType = profile.riskType as RiskType;
  const signals = getMarketSignals(indicators);
  const allocation = applySignals(riskType, signals);
  const baseAllocation = BASE_ALLOCATION[riskType];

  return NextResponse.json({
    riskType,
    riskTypeLabel: RISK_TYPE_LABEL[riskType],
    riskTypeDesc: RISK_TYPE_DESC[riskType],
    allocation,
    baseAllocation,
    signals,
    indicators,
    updatedAt: new Date().toISOString(),
  });
}
