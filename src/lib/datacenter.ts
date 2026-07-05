import { prisma } from "@/lib/prisma";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface CapexPoint {
  period: string; // "2025Q1"
  msft: number;
  amzn: number;
  goog: number;
  meta: number;
  total: number;
}

export interface PowerPoint {
  period: string; // "2025-06"
  value: number;  // GWh
}

export interface DCCountPoint {
  period: string;
  value: number;
}

export interface CountryRecord {
  country: string;
  value: number;
  period: string;
}

export interface SemiconPoint {
  period: string; // "2025-06"
  exportUsdB: number;
}

// ─── 미국 Capex 추이 (최근 8분기) ────────────────────────────────────────────

export async function getDCCapexSeries(): Promise<CapexPoint[]> {
  const metrics = ["CAPEX_MSFT", "CAPEX_AMZN", "CAPEX_GOOG", "CAPEX_META"];
  const rows = await prisma.dataCenterRecord.findMany({
    where: { metric: { in: metrics }, country: "US" },
    orderBy: { period: "asc" },
  });

  const periods = [...new Set(rows.map((r) => r.period))].sort();

  const all = periods.map((period) => {
    const get = (m: string) =>
      rows.find((r) => r.metric === m && r.period === period)?.value ?? 0;
    const msft = get("CAPEX_MSFT");
    const amzn = get("CAPEX_AMZN");
    const goog = get("CAPEX_GOOG");
    const meta = get("CAPEX_META");
    const present = [msft, amzn, goog, meta].filter((v) => v > 0).length;
    return { period, msft, amzn, goog, meta, total: msft + amzn + goog + meta, present };
  });

  // MSFT는 7월-6월 회계연도 → Q4(10월-12월)만 보고 → 단일 회사만 있는 분기 제외
  return all
    .filter((p) => p.present >= 3)
    .slice(-8)
    .map(({ present: _, ...rest }) => rest);
}

// ─── 버지니아 전력 수요 추이 (최근 24개월) ───────────────────────────────────

export async function getDCPowerSeries(): Promise<PowerPoint[]> {
  const rows = await prisma.dataCenterRecord.findMany({
    where: { metric: "POWER_VA", country: "US" },
    orderBy: { period: "desc" },
    take: 24,
  });
  return rows.reverse().map((r) => ({ period: r.period, value: r.value }));
}

// ─── 미국 DC 수 추이 (전체 이력) ─────────────────────────────────────────────

export async function getDCCountUsSeries(): Promise<DCCountPoint[]> {
  const rows = await prisma.dataCenterRecord.findMany({
    where: { metric: "DC_COUNT", country: "US" },
    orderBy: { period: "asc" },
  });
  return rows.map((r) => ({ period: r.period, value: r.value }));
}

// ─── 글로벌 국가별 최신 DC 카운트 ────────────────────────────────────────────

export async function getDCCountries(): Promise<CountryRecord[]> {
  const rows = await prisma.dataCenterRecord.findMany({
    where: { metric: "DC_COUNT" },
    orderBy: { period: "desc" },
  });

  // 국가별 최신 1건만
  const seen = new Set<string>();
  const latest: CountryRecord[] = [];
  for (const r of rows) {
    if (!seen.has(r.country)) {
      seen.add(r.country);
      latest.push({ country: r.country, value: r.value, period: r.period });
    }
  }
  return latest.sort((a, b) => b.value - a.value);
}

// ─── 미국 요약 카드 계산 ─────────────────────────────────────────────────────

export interface DCSummary {
  usDcCount: number | null;
  capexTotalLatest: number | null;   // 최근 분기 4사 합산 $B
  capexTotalPrev: number | null;     // 전분기 합산 (QoQ 계산용)
  powerLatest: number | null;        // 최근 월 GWh
  powerYoyPeriod: number | null;     // 12개월 전 GWh (YoY 계산용)
  latestCapexPeriod: string | null;
  latestPowerPeriod: string | null;
}

export async function getDCSummary(): Promise<DCSummary> {
  const [dcCountRow, capexRows, powerRows] = await Promise.all([
    prisma.dataCenterRecord.findFirst({
      where: { metric: "DC_COUNT", country: "US" },
      orderBy: { period: "desc" },
    }),
    prisma.dataCenterRecord.findMany({
      where: {
        metric: { in: ["CAPEX_MSFT", "CAPEX_AMZN", "CAPEX_GOOG", "CAPEX_META"] },
        country: "US",
      },
      orderBy: { period: "desc" },
    }),
    prisma.dataCenterRecord.findMany({
      where: { metric: "POWER_VA", country: "US" },
      orderBy: { period: "desc" },
      take: 14,
    }),
  ]);

  // Capex: 최근 분기와 전분기 합산
  // MSFT 회계연도 불일치(Q4 단독 분기) 제외 — 3사 이상 존재하는 분기만 사용
  const allPeriods = [...new Set(capexRows.map((r) => r.period))].sort();
  const qualifiedPeriods = allPeriods.filter((period) => {
    const present = ["CAPEX_MSFT","CAPEX_AMZN","CAPEX_GOOG","CAPEX_META"].filter(
      (m) => capexRows.some((r) => r.metric === m && r.period === period && r.value > 0),
    ).length;
    return present >= 3;
  }).reverse();
  const latestPeriod = qualifiedPeriods[0] ?? null;
  const prevPeriod = qualifiedPeriods[1] ?? null;

  const sumCapex = (p: string | null) =>
    p
      ? capexRows
          .filter((r) => r.period === p)
          .reduce((s, r) => s + r.value, 0)
      : null;

  // 전력: 최신 + 12개월 전
  const powerLatest = powerRows[0]?.value ?? null;
  const latestPowerPeriod = powerRows[0]?.period ?? null;
  const powerYoy = powerRows[12]?.value ?? null; // 정확히 12개월 전 (index=12)

  return {
    usDcCount: dcCountRow?.value ?? null,
    capexTotalLatest: sumCapex(latestPeriod),
    capexTotalPrev: sumCapex(prevPeriod),
    powerLatest,
    powerYoyPeriod: powerYoy,
    latestCapexPeriod: latestPeriod,
    latestPowerPeriod,
  };
}

// ─── 반도체 수출 시계열 (쌍축 상관용) ───────────────────────────────────────

export async function getSemiconExportSeries(): Promise<SemiconPoint[]> {
  const rows = await prisma.monthlyExport.findMany({
    where: { itemCode: "SEMICON" },
    orderBy: { yearMonth: "asc" },
    take: 36,
  });
  return rows.map((r) => ({
    period: r.yearMonth,
    exportUsdB: Number(r.exportUsd) / 1_000_000_000,
  }));
}
