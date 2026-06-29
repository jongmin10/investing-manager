import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kstDateStr, kstDayRange } from "@/lib/kst";
import type { ScreenerItem, ScreenerResult } from "@/lib/screener-types";
import {
  evaluateBreakout,
  type BreakoutParams,
  type BreakoutSnapshotRow,
} from "@/lib/screener-breakout";

/** NaN/범위 가드가 적용된 정수 파라미터 */
function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const v = parseInt(raw ?? "", 10);
  if (Number.isNaN(v)) return def;
  return Math.min(Math.max(v, min), max);
}

/** NaN/범위 가드가 적용된 실수 파라미터 */
function clampFloat(raw: string | null, def: number, min: number, max: number): number {
  const v = parseFloat(raw ?? "");
  if (Number.isNaN(v)) return def;
  return Math.min(Math.max(v, min), max);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const market           = sp.get("market")           ?? "ALL";
  const sector           = sp.get("sector")           ?? "";
  const high52wMin       = parseFloat(sp.get("high52wMin")       ?? "0");
  const changeRateMin    = sp.get("changeRateMin")    ? parseFloat(sp.get("changeRateMin")!)    : null;
  const changeRateMax    = sp.get("changeRateMax")    ? parseFloat(sp.get("changeRateMax")!)    : null;
  const revenueGrowthMin = sp.get("revenueGrowthMin") ? parseFloat(sp.get("revenueGrowthMin")!) : null;
  const opGrowthMin      = sp.get("opGrowthMin")      ? parseFloat(sp.get("opGrowthMin")!)      : null;
  const netGrowthMin     = sp.get("netGrowthMin")     ? parseFloat(sp.get("netGrowthMin")!)     : null;
  const opMarginMin        = sp.get("opMarginMin")        ? parseFloat(sp.get("opMarginMin")!)        : null;
  const dividendYieldMin   = sp.get("dividendYieldMin")   ? parseFloat(sp.get("dividendYieldMin")!)   : null;
  const revenueMin       = sp.get("revenueMin")       ? parseFloat(sp.get("revenueMin")!)       : null;
  const profitableOnly   = sp.get("profitableOnly")   === "true";
  const volumeMin        = sp.get("volumeMin")        ? parseFloat(sp.get("volumeMin")!)        : null;
  const sortBy           = sp.get("sortBy")           ?? "high52wRatio";
  const limit            = Math.min(parseInt(sp.get("limit") ?? "100"), 200);

  // ── 52주 신고가 돌파 파라미터 (NaN/범위 가드) ──────────
  const breakout = sp.get("breakout") === "true";
  const breakoutParams: BreakoutParams = {
    quietDays:     clampInt(sp.get("breakoutQuietDays"),     60, 1, 252),
    windowDays:    clampInt(sp.get("breakoutWindowDays"),     5, 1, 60),
    tolerance:     clampFloat(sp.get("breakoutTolerance"),  0.5, 0, 5),
    quietMaxRatio: clampFloat(sp.get("breakoutQuietMaxRatio"), 80, 60, 95),
  };

  const latest = await prisma.stockSnapshot.findFirst({ orderBy: { date: "desc" } });
  if (!latest) {
    const empty: ScreenerResult = { items: [], total: 0, sectors: [], collectedAt: null, isUpToDate: false, financialStatus: null };
    return NextResponse.json(empty);
  }

  const latestStr = kstDateStr(latest.date);            // KST 기준 최신 수집일
  const { start: dayStart, end: dayEnd } = kstDayRange(latestStr);

  const sectorRows = await prisma.stock.findMany({
    select: { sector: true }, distinct: ["sector"],
    where: { sector: { not: null } }, orderBy: { sector: "asc" },
  });
  const sectors = sectorRows.map((r) => r.sector).filter(Boolean) as string[];

  // 최신 연간 재무 데이터 (stockId별 최신 1건)
  const financials = await prisma.stockFinancial.findMany({
    where: { period: { endsWith: "A" } },
    orderBy: [{ stockId: "asc" }, { period: "desc" }],
  });
  const financialMap = new Map<string, typeof financials[0]>();
  for (const f of financials) {
    if (!financialMap.has(f.stockId)) financialMap.set(f.stockId, f);
  }

  const financialStatus = {
    count: financialMap.size,
    hasDartKey: !!process.env.DART_API_KEY,
  };

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

  let items: ScreenerItem[] = snapshots.map((s) => {
    const fin = financialMap.get(s.stockId);
    const per          = s.per    != null ? parseFloat(s.per.toFixed(2))    : null;
    const cnsPer       = s.cnsPer != null ? parseFloat(s.cnsPer.toFixed(2)) : null;
    const cnsEps       = s.cnsEps != null ? parseFloat(s.cnsEps.toFixed(2)) : null;
    const pbr          = s.pbr    != null ? parseFloat(s.pbr.toFixed(2))    : null;
    const dividendYield = s.dividendYield != null ? parseFloat(s.dividendYield.toFixed(2)) : null;
    return {
      id: s.stockId, name: s.stock.name,
      market: s.stock.market, sector: s.stock.sector,
      price: s.price, changeRate: s.changeRate,
      high52w: s.high52w, low52w: s.low52w,
      high52wRatio: s.high52w > 0 ? parseFloat((s.price / s.high52w * 100).toFixed(1)) : 0,
      volume: s.volume, collectedAt: s.date.toISOString(),
      revenue:         fin?.revenue         ?? null,
      operatingProfit: fin?.operatingProfit ?? null,
      revenueGrowth:   fin?.revenueGrowth   ?? null,
      opGrowth:        fin?.opGrowth        ?? null,
      netGrowth:       fin?.netGrowth       ?? null,
      opMargin:        fin?.opMargin        ?? null,
      cnsEps, per, cnsPer, pbr, dividendYield,
      period: fin?.period ?? null,
      // 돌파 필드 기본값 (breakout 필터 OFF 시 히스토리 쿼리 없이 그대로 반환 → 성능 회귀 없음)
      breakout: false,
      breakoutDate: null,
      consolidationDays: null,
      priorMaxRatio: null,
      breakoutReason: null,
    };
  });

  // ── 필터 ──────────────────────────────────────────────
  if (high52wMin > 0)
    items = items.filter((i) => i.high52wRatio >= high52wMin);
  if (changeRateMin !== null)
    items = items.filter((i) => (i.changeRate ?? 0) >= changeRateMin);
  if (changeRateMax !== null)
    items = items.filter((i) => (i.changeRate ?? 0) <= changeRateMax);
  if (volumeMin !== null)
    items = items.filter((i) => i.volume != null && i.volume >= volumeMin);
  if (profitableOnly)
    items = items.filter((i) => i.operatingProfit != null && i.operatingProfit > 0);
  if (revenueMin !== null)
    items = items.filter((i) => i.revenue != null && i.revenue >= revenueMin);
  if (revenueGrowthMin !== null)
    items = items.filter((i) => i.revenueGrowth != null && i.revenueGrowth >= revenueGrowthMin);
  if (opGrowthMin !== null)
    items = items.filter((i) => i.opGrowth != null && i.opGrowth >= opGrowthMin);
  if (netGrowthMin !== null)
    items = items.filter((i) => i.netGrowth != null && i.netGrowth >= netGrowthMin);
  if (opMarginMin !== null)
    items = items.filter((i) => i.opMargin != null && i.opMargin >= opMarginMin);
  if (dividendYieldMin !== null)
    items = items.filter((i) => i.dividendYield != null && i.dividendYield >= dividendYieldMin);

  // ── 52주 신고가 돌파 판정 (breakout 필터 ON 일 때만 히스토리 윈도 쿼리) ──
  if (breakout && items.length > 0) {
    const { quietDays: N, windowDays: M } = breakoutParams;
    // 캘린더로 넉넉히 조회 후 메모리에서 거래일 절단: buffer = (N+M)*1.5 + 15 캘린더일
    const cutoffDays = Math.ceil((N + M) * 1.5) + 15;
    const cutoff = new Date(dayStart.getTime() - cutoffDays * 86_400_000);

    const ids = items.map((i) => i.id);
    const history = await prisma.stockSnapshot.findMany({
      where: { stockId: { in: ids }, date: { gte: cutoff, lte: dayEnd } },
      select: { stockId: true, date: true, price: true, high52w: true, changeRate: true },
      orderBy: [{ stockId: "asc" }, { date: "asc" }],
    });

    const byStock = new Map<string, BreakoutSnapshotRow[]>();
    for (const r of history) {
      const arr = byStock.get(r.stockId);
      const row: BreakoutSnapshotRow = { date: r.date, price: r.price, high52w: r.high52w, changeRate: r.changeRate };
      if (arr) arr.push(row);
      else byStock.set(r.stockId, [row]);
    }

    for (const item of items) {
      const series = byStock.get(item.id) ?? [];
      const res = evaluateBreakout(series, breakoutParams);
      item.breakout = res.breakout;
      item.breakoutDate = res.breakoutDate;
      item.consolidationDays = res.consolidationDays;
      item.priorMaxRatio = res.priorMaxRatio;
      item.breakoutReason = res.breakoutReason;
    }

    // 필터 활성 시 isBreakout 종목만 반환
    items = items.filter((i) => i.breakout);
  }

  // ── 정렬 ──────────────────────────────────────────────
  items.sort((a, b) => {
    switch (sortBy) {
      case "changeRate":    return (b.changeRate    ?? 0)         - (a.changeRate    ?? 0);
      case "price":         return b.price - a.price;
      case "volume":        return (b.volume        ?? 0)         - (a.volume        ?? 0);
      case "revenueGrowth": return (b.revenueGrowth ?? -Infinity) - (a.revenueGrowth ?? -Infinity);
      case "opGrowth":      return (b.opGrowth      ?? -Infinity) - (a.opGrowth      ?? -Infinity);
      case "netGrowth":     return (b.netGrowth     ?? -Infinity) - (a.netGrowth     ?? -Infinity);
      case "revenue":       return (b.revenue       ?? -Infinity) - (a.revenue       ?? -Infinity);
      case "breakoutDate": {
        // AC-NULL-SORT: breakoutDate=null 은 맨 뒤 (기존 -Infinity 패턴)
        const av = a.breakoutDate ? new Date(a.breakoutDate).getTime() : -Infinity;
        const bv = b.breakoutDate ? new Date(b.breakoutDate).getTime() : -Infinity;
        return bv - av;
      }
      default:              return b.high52wRatio - a.high52wRatio;
    }
  });

  const result: ScreenerResult = {
    items: items.slice(0, limit),
    total: items.length,
    sectors,
    financialStatus,
    collectedAt:  latest.date.toISOString(),
    isUpToDate:   latestStr === kstDateStr(),
  };
  return NextResponse.json(result);
}
