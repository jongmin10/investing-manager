import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const market           = sp.get("market")           ?? "ALL";
  const sector           = sp.get("sector")           ?? "";
  const high52wMin       = parseFloat(sp.get("high52wMin")       ?? "0");
  const changeRateMin    = sp.get("changeRateMin")    ? parseFloat(sp.get("changeRateMin")!)    : null;
  const changeRateMax    = sp.get("changeRateMax")    ? parseFloat(sp.get("changeRateMax")!)    : null;
  const revenueGrowthMin = sp.get("revenueGrowthMin") ? parseFloat(sp.get("revenueGrowthMin")!) : null;
  const opGrowthMin      = sp.get("opGrowthMin")      ? parseFloat(sp.get("opGrowthMin")!)      : null;
  const opMarginMin      = sp.get("opMarginMin")      ? parseFloat(sp.get("opMarginMin")!)      : null;
  const sortBy           = sp.get("sortBy")           ?? "high52wRatio";
  const limit            = Math.min(parseInt(sp.get("limit") ?? "100"), 200);

  // 가장 최근 스냅샷 날짜 조회
  const latest = await prisma.stockSnapshot.findFirst({ orderBy: { date: "desc" } });
  if (!latest) {
    return NextResponse.json({ items: [], total: 0, sectors: [], collectedAt: null, isUpToDate: false, financialStatus: null });
  }

  const latestStr = latest.date.toISOString().slice(0, 10);
  const dayStart  = new Date(latestStr + "T00:00:00.000Z");
  const dayEnd    = new Date(latestStr + "T23:59:59.999Z");

  // 업종 목록 (필터 드롭다운)
  const sectorRows = await prisma.stock.findMany({
    select: { sector: true },
    distinct: ["sector"],
    where:  { sector: { not: null } },
    orderBy: { sector: "asc" },
  });
  const sectors = sectorRows.map((r) => r.sector).filter(Boolean) as string[];

  // 최신 재무 데이터 — 연간(A) 기준 stockId별 최신 1건
  const financials = await prisma.stockFinancial.findMany({
    where:   { period: { endsWith: "A" } },
    orderBy: [{ stockId: "asc" }, { period: "desc" }],
  });
  const financialMap = new Map<string, typeof financials[0]>();
  for (const f of financials) {
    if (!financialMap.has(f.stockId)) financialMap.set(f.stockId, f);
  }

  // 재무 수집 현황
  const financialStatus = {
    count:   financialMap.size,
    hasDartKey: !!process.env.DART_API_KEY,
  };

  // 스냅샷 조회
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

  type Item = {
    id:           string;
    name:         string;
    market:       string;
    sector:       string | null;
    price:        number;
    changeRate:   number | null;
    high52w:      number;
    low52w:       number;
    high52wRatio: number;
    volume:       number | null;
    collectedAt:  Date;
    // 재무
    revenue:        number | null;
    operatingProfit: number | null;
    revenueGrowth:  number | null;
    opGrowth:       number | null;
    netGrowth:      number | null;
    opMargin:       number | null;
    period:         string | null;
  };

  let items: Item[] = snapshots.map((s) => {
    const fin = financialMap.get(s.stockId);
    return {
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
      // 재무 (없으면 null)
      revenue:         fin?.revenue         ?? null,
      operatingProfit: fin?.operatingProfit ?? null,
      revenueGrowth:   fin?.revenueGrowth   ?? null,
      opGrowth:        fin?.opGrowth        ?? null,
      netGrowth:       fin?.netGrowth       ?? null,
      opMargin:        fin?.opMargin        ?? null,
      period:          fin?.period          ?? null,
    };
  });

  // ── 필터 적용 ──────────────────────────────────────────
  if (high52wMin > 0)
    items = items.filter((i) => i.high52wRatio >= high52wMin);

  if (changeRateMin !== null)
    items = items.filter((i) => (i.changeRate ?? 0) >= changeRateMin);

  if (changeRateMax !== null)
    items = items.filter((i) => (i.changeRate ?? 0) <= changeRateMax);

  if (revenueGrowthMin !== null)
    items = items.filter((i) => i.revenueGrowth != null && i.revenueGrowth >= revenueGrowthMin);

  if (opGrowthMin !== null)
    items = items.filter((i) => i.opGrowth != null && i.opGrowth >= opGrowthMin);

  if (opMarginMin !== null)
    items = items.filter((i) => i.opMargin != null && i.opMargin >= opMarginMin);

  // ── 정렬 ──────────────────────────────────────────────
  items.sort((a, b) => {
    switch (sortBy) {
      case "changeRate":   return (b.changeRate   ?? 0) - (a.changeRate   ?? 0);
      case "price":        return b.price - a.price;
      case "revenueGrowth": return (b.revenueGrowth ?? -Infinity) - (a.revenueGrowth ?? -Infinity);
      case "opGrowth":     return (b.opGrowth      ?? -Infinity) - (a.opGrowth      ?? -Infinity);
      default:             return b.high52wRatio - a.high52wRatio;
    }
  });

  const today      = new Date().toISOString().slice(0, 10);
  const isUpToDate = latestStr === today;

  return NextResponse.json({
    items: items.slice(0, limit),
    total: items.length,
    sectors,
    financialStatus,
    collectedAt:  latest.date,
    isUpToDate,
  });
}
