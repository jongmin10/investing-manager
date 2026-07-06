import { prisma } from "@/lib/prisma";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface CapexPoint {
  period: string;  // "2025Q1"
  msft: number;
  amzn: number;
  goog: number;
  meta: number;
  total: number;
  partial: boolean; // Q4(Oct-Dec): AMZN·GOOG·META는 10-K 보고라 MSFT만 존재
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
  wowPct: number | null; // 주간 증가율 (전주 대비)
  momPct: number | null; // 월간 증가율 (4주 전 대비)
}

export interface SemiconPoint {
  period: string; // "2025-06"
  exportUsdB: number;
}

export interface SdllmtkPoint {
  period: string; // "2026-07-04"
  value: number;  // USD per million tokens
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

  // 모든 분기 표시. Q4(Oct-Dec)는 AMZN·GOOG·META가 10-K 보고라 MSFT만 존재 → partial 플래그
  return all
    .slice(-10)
    .map(({ present, ...rest }) => ({ ...rest, partial: present < 3 }));
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

// ─── 미국 DC 수 추이 (주별 이력) ─────────────────────────────────────────────

export async function getDCCountUsSeries(): Promise<DCCountPoint[]> {
  const rows = await prisma.dataCenterRecord.findMany({
    where: {
      metric: "DC_COUNT",
      country: "US",
      period: { contains: "-W" }, // ISO 주별 레코드만
    },
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

  // 국가별로 기간 내림차순 정렬: [0]=최신, [1]=전주, [4]=4주전(~1개월)
  const byCountry = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCountry.get(r.country) ?? [];
    list.push(r);
    byCountry.set(r.country, list);
  }

  const result: CountryRecord[] = [];
  for (const [country, list] of byCountry) {
    const cur = list[0];
    if (!cur) continue;
    const prev1 = list[1] ?? null;  // 1주 전
    const prev4 = list[4] ?? null;  // 4주 전 (~1개월)
    const wowPct = prev1 ? ((cur.value - prev1.value) / prev1.value) * 100 : null;
    const momPct = prev4 ? ((cur.value - prev4.value) / prev4.value) * 100 : null;
    result.push({ country, value: cur.value, period: cur.period, wowPct, momPct });
  }
  return result.sort((a, b) => b.value - a.value);
}

// ─── 미국 요약 카드 계산 ─────────────────────────────────────────────────────

export interface DCSummary {
  usDcCount: number | null;
  usDCWoW: number | null;           // 미국 DC 수 전주 대비 증가율 (%)
  usDCMoM: number | null;           // 미국 DC 수 4주 전 대비 증가율 (%)
  capexTotalLatest: number | null;   // 최근 분기 4사 합산 $B
  capexTotalPrev: number | null;     // 전분기 합산 (QoQ 계산용)
  powerLatest: number | null;        // 최근 월 GWh
  powerYoyPeriod: number | null;     // 12개월 전 GWh (YoY 계산용)
  latestCapexPeriod: string | null;
  latestPowerPeriod: string | null;
}

export async function getDCSummary(): Promise<DCSummary> {
  const [dcCountRows, capexRows, powerRows] = await Promise.all([
    prisma.dataCenterRecord.findMany({
      where: {
        metric: "DC_COUNT",
        country: "US",
        period: { contains: "-W" }, // ISO 주별 레코드만
      },
      orderBy: { period: "desc" },
      take: 6, // WoW(1주), MoM(4주) 계산용
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

  // DC 카운트: 최신 + 전주(index=1) + 4주 전(index=4)
  const dcCur = dcCountRows[0] ?? null;
  const dcPrev1 = dcCountRows[1] ?? null; // 1주 전
  const dcPrev4 = dcCountRows[4] ?? null; // 4주 전 (~1개월)
  const usDCWoW = dcCur && dcPrev1 ? ((dcCur.value - dcPrev1.value) / dcPrev1.value) * 100 : null;
  const usDCMoM = dcCur && dcPrev4 ? ((dcCur.value - dcPrev4.value) / dcPrev4.value) * 100 : null;

  // 전력: 최신 + 12개월 전
  const powerLatest = powerRows[0]?.value ?? null;
  const latestPowerPeriod = powerRows[0]?.period ?? null;
  const powerYoy = powerRows[12]?.value ?? null; // 정확히 12개월 전 (index=12)

  return {
    usDcCount: dcCur?.value ?? null,
    usDCWoW,
    usDCMoM,
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

// ─── SDLLMTK 시계열 (최근 90일) ──────────────────────────────────────────────

export async function getSdllmtkSeries(): Promise<SdllmtkPoint[]> {
  const rows = await prisma.dataCenterRecord.findMany({
    where: { metric: "SDLLMTK", country: "GLOBAL" },
    orderBy: { period: "asc" },
    take: 90,
  });
  return rows.map((r) => ({ period: r.period, value: r.value }));
}
