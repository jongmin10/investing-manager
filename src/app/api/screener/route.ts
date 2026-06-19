import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const market        = sp.get("market")        ?? "ALL";
  const sector        = sp.get("sector")        ?? "";
  const high52wMin    = parseFloat(sp.get("high52wMin")    ?? "0");
  const changeRateMin = sp.get("changeRateMin") ? parseFloat(sp.get("changeRateMin")!) : null;
  const changeRateMax = sp.get("changeRateMax") ? parseFloat(sp.get("changeRateMax")!) : null;
  const sortBy        = sp.get("sortBy")        ?? "high52wRatio"; // high52wRatio | changeRate | price
  const limit         = Math.min(parseInt(sp.get("limit") ?? "100"), 200);

  // 가장 최근 스냅샷 날짜 조회
  const latest = await prisma.stockSnapshot.findFirst({ orderBy: { date: "desc" } });
  if (!latest) {
    return NextResponse.json({ items: [], total: 0, sectors: [], collectedAt: null, isUpToDate: false });
  }

  const latestStr = latest.date.toISOString().slice(0, 10);
  const dayStart  = new Date(latestStr + "T00:00:00.000Z");
  const dayEnd    = new Date(latestStr + "T23:59:59.999Z");

  // 모든 업종 목록 (필터 드롭다운용)
  const sectorRows = await prisma.stock.findMany({
    select: { sector: true },
    distinct: ["sector"],
    where: { sector: { not: null } },
    orderBy: { sector: "asc" },
  });
  const sectors = sectorRows.map((r) => r.sector).filter(Boolean) as string[];

  // 스냅샷 + 종목 정보 조회
  const snapshots = await prisma.stockSnapshot.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      stock: {
        ...(market !== "ALL" ? { market } : {}),
        ...(sector ? { sector } : {}),
      },
    },
    include: { stock: { select: { name: true, market: true, sector: true } } },
  });

  // 계산 필드 추가 + 필터 적용
  type Item = {
    id: string; name: string; market: string; sector: string | null;
    price: number; changeRate: number | null;
    high52w: number; low52w: number; high52wRatio: number;
    volume: number | null; collectedAt: Date;
  };

  let items: Item[] = snapshots.map((s) => ({
    id:           s.stockId,
    name:         s.stock.name,
    market:       s.stock.market,
    sector:       s.stock.sector,
    price:        s.price,
    changeRate:   s.changeRate,
    high52w:      s.high52w,
    low52w:       s.low52w,
    high52wRatio: s.high52w > 0 ? parseFloat((s.price / s.high52w * 100).toFixed(1)) : 0,
    volume:       s.volume,
    collectedAt:  s.date,
  }));

  if (high52wMin > 0)           items = items.filter((i) => i.high52wRatio >= high52wMin);
  if (changeRateMin !== null)   items = items.filter((i) => (i.changeRate ?? 0) >= changeRateMin);
  if (changeRateMax !== null)   items = items.filter((i) => (i.changeRate ?? 0) <= changeRateMax);

  // 정렬
  items.sort((a, b) => {
    if (sortBy === "changeRate") return (b.changeRate ?? 0) - (a.changeRate ?? 0);
    if (sortBy === "price")      return b.price - a.price;
    return b.high52wRatio - a.high52wRatio; // 기본: 52주 고가 근접도
  });

  const today      = new Date().toISOString().slice(0, 10);
  const isUpToDate = latestStr === today;

  return NextResponse.json({
    items: items.slice(0, limit),
    total: items.length,
    sectors,
    collectedAt:  latest.date,
    isUpToDate,
  });
}
