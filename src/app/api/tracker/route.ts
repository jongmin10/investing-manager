import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  AssetClass,
  IndicatorSnapshot,
  calculateReturn,
  weightedPortfolioReturn,
} from "@/lib/tracker";

async function getIndicatorAt(type: string, date: Date): Promise<number> {
  const record = await prisma.indicatorRecord.findFirst({
    where: { type, recordedAt: { lte: date } },
    orderBy: { recordedAt: "desc" },
  });
  return record?.value ?? 0;
}

async function getLatestIndicator(type: string): Promise<number> {
  const record = await prisma.indicatorRecord.findFirst({
    where: { type },
    orderBy: { recordedAt: "desc" },
  });
  return record?.value ?? 0;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holdings = await prisma.portfolioHolding.findMany({
    where: { userId: session.user.id },
    orderBy: { purchaseDate: "asc" },
  });

  if (holdings.length === 0) {
    return NextResponse.json({ holdings: [], portfolio: null, benchmarks: null });
  }

  // Current indicator values
  const [kospiNow, bondRateNow, bokRateNow, cpiNow] = await Promise.all([
    getLatestIndicator("KOSPI"),
    getLatestIndicator("GOV_BOND_3Y"),
    getLatestIndicator("BOK_BASE_RATE"),
    getLatestIndicator("CPI"),
  ]);
  const nowSnapshot: IndicatorSnapshot = {
    kospi: kospiNow,
    bondRate3Y: bondRateNow,
    bokRate: bokRateNow,
  };

  // Calculate return for each holding
  const holdingsWithReturn = await Promise.all(
    holdings.map(async (h) => {
      const purchaseDate = new Date(h.purchaseDate);
      const [kospiAt, bondAt, bokAt] = await Promise.all([
        getIndicatorAt("KOSPI", purchaseDate),
        getIndicatorAt("GOV_BOND_3Y", purchaseDate),
        getIndicatorAt("BOK_BASE_RATE", purchaseDate),
      ]);
      const atPurchase: IndicatorSnapshot = {
        kospi: kospiAt,
        bondRate3Y: bondAt,
        bokRate: bokAt,
      };
      const estimatedReturn = calculateReturn(
        h.assetClass as AssetClass,
        purchaseDate,
        atPurchase,
        nowSnapshot
      );
      return { ...h, estimatedReturn: Math.round(estimatedReturn * 100) / 100 };
    })
  );

  const totalReturn = weightedPortfolioReturn(
    holdingsWithReturn.map((h) => ({ weight: h.weight, estimatedReturn: h.estimatedReturn }))
  );
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);

  // Benchmark: KOSPI from earliest purchase date
  const earliestPurchase = new Date(holdings[0].purchaseDate);
  const [kospiAtEarliest] = await Promise.all([getIndicatorAt("KOSPI", earliestPurchase)]);
  const kospiReturn =
    kospiAtEarliest > 0 ? ((kospiNow - kospiAtEarliest) / kospiAtEarliest) * 100 : 0;

  // CPI as annualized return benchmark
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const yearsElapsed = (Date.now() - earliestPurchase.getTime()) / MS_PER_YEAR;
  const cpiAccumulated = cpiNow * yearsElapsed;

  return NextResponse.json({
    holdings: holdingsWithReturn,
    portfolio: {
      totalReturn: Math.round(totalReturn * 100) / 100,
      totalWeight: Math.round(totalWeight * 10) / 10,
    },
    benchmarks: {
      kospi: Math.round(kospiReturn * 100) / 100,
      cpi: Math.round(cpiAccumulated * 100) / 100,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { fundName, assetClass, weight, purchaseDate } = body as {
    fundName: string;
    assetClass: AssetClass;
    weight: number;
    purchaseDate: string;
  };

  if (!fundName || !assetClass || weight == null || !purchaseDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validClasses: AssetClass[] = ["GUARANTEED", "BOND", "MIXED", "EQUITY"];
  if (!validClasses.includes(assetClass)) {
    return NextResponse.json({ error: "Invalid asset class" }, { status: 400 });
  }

  if (weight <= 0 || weight > 100) {
    return NextResponse.json({ error: "Weight must be between 1 and 100" }, { status: 400 });
  }

  const holding = await prisma.portfolioHolding.create({
    data: {
      userId: session.user.id,
      fundName: fundName.trim(),
      assetClass,
      weight,
      purchaseDate: new Date(purchaseDate),
    },
  });

  return NextResponse.json(holding, { status: 201 });
}
