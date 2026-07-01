import { prisma } from "@/lib/prisma";
import { currentYearMonth, isValidYearMonth } from "@/lib/monthly-returns";

export { currentYearMonth, isValidYearMonth };

/**
 * 주요 수출 품목군 (스펙 §1·§3.3). code=내부코드, name=표시명, hs=대표 HS 4단위(수집 매핑용).
 * hs 매핑은 disjoint partition 원칙(한 HS→한 품목군). 착수 0단계에서 실호출로 정밀화 예정.
 * "ETC"는 매핑되지 않은 잔여 흡수 버킷.
 */
export interface ItemGroup {
  code: string;
  name: string;
  hs: string[]; // 대표 HS 4단위 (수집 스크립트가 소유, 서비스층은 미사용)
}

export const ITEM_GROUPS: ItemGroup[] = [
  { code: "SEMICON", name: "반도체", hs: ["8541", "8542"] },
  { code: "AUTO", name: "자동차", hs: ["8703"] },
  { code: "AUTO_PARTS", name: "자동차부품", hs: ["8708"] },
  { code: "OIL_PROD", name: "석유제품", hs: ["2710"] },
  { code: "PETROCHEM", name: "석유화학", hs: ["3901", "3902", "2902"] },
  { code: "SHIP", name: "선박", hs: ["8901", "8905"] },
  { code: "WIRELESS", name: "무선통신기기", hs: ["8517"] },
  { code: "DISPLAY", name: "디스플레이", hs: ["8524"] },
  { code: "STEEL", name: "철강", hs: ["7208", "7210", "7219"] },
  { code: "COMPUTER", name: "컴퓨터", hs: ["8471"] },
  { code: "MACHINE", name: "일반기계", hs: ["8479"] },
  { code: "BIO", name: "바이오헬스", hs: ["3002", "3004"] },
  { code: "BATTERY", name: "이차전지", hs: ["8507"] },
  { code: "HOME_APPL", name: "가전", hs: ["8418", "8450"] },
  { code: "TEXTILE", name: "섬유류", hs: ["6104", "6109", "5407"] },
  { code: "ETC", name: "기타", hs: [] },
];

export const ITEM_CODES = ITEM_GROUPS.map((g) => g.code);
export const DEFAULT_ITEM = "SEMICON";

export function isItemCode(v: string): boolean {
  return ITEM_CODES.includes(v);
}
export function itemName(code: string): string {
  return ITEM_GROUPS.find((g) => g.code === code)?.name ?? code;
}

export type ExportMetric = "export" | "import" | "balance";
export function isMetric(v: string): v is ExportMetric {
  return v === "export" || v === "import" || v === "balance";
}

// ── 표시 포맷 (스펙 §6.6 formatExportUsd) ────────────────────────────────
/** USD 원값 → "131.2억$" / "1.3조$" (1억=1e8, 1조=1e12). null 은 "—". */
export function formatExportUsd(usd: number | null): string {
  if (usd === null || !isFinite(usd)) return "—";
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조$`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}억$`;
  return `${sign}${Math.round(abs).toLocaleString()}$`;
}

// ── 조회 타입 ────────────────────────────────────────────────────────────
export interface ExportRow {
  yearMonth: string;
  value: number; // metric 에 따른 값(USD 원값). export|import|balance
  yoyPct: number | null; // 전년동월대비 %, 잠정 행·12개월 미만은 null
  provisional: boolean;
  periodLabel: string | null;
}

export interface ExportSeriesResponse {
  item: { code: string; name: string };
  metric: ExportMetric;
  rows: ExportRow[];
  summary: {
    firstAvailable: string | null;
    latestConfirmedYm: string | null;
    latestYm: string | null;
    latestValue: number | null;
    latestYoyPct: number | null;
    latestProvisional: boolean;
  };
}

export interface RankingRow {
  rank: number;
  itemCode: string;
  itemName: string;
  value: number;
  yoyPct: number | null;
  provisional: boolean;
}

export interface ExportRankingResponse {
  ym: string;
  metric: ExportMetric;
  rows: RankingRow[];
  coverage: { coveredItems: number; totalItems: number; provisional: boolean };
}

export interface ExportMetaResponse {
  items: { code: string; name: string }[];
  firstAvailable: string | null;
  latestConfirmedYm: string | null;
}

// BigInt(USD 원단위) → Number 변환은 metricValue 에서 수행. 수출액 규모(~1e11)는 2^53 이내라 안전.
function metricValue(
  metric: ExportMetric,
  exportUsd: bigint,
  importUsd: bigint | null
): number | null {
  if (metric === "export") return Number(exportUsd);
  if (metric === "import") return importUsd === null ? null : Number(importUsd);
  // balance = 수출 − 수입
  return importUsd === null ? null : Number(exportUsd - importUsd);
}

/** "YYYY-MM" 12개월 전 */
function ymMinus12(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

/**
 * 품목 월별 시계열(+YoY). metric 별 값. 잠정 행 YoY 는 null(편향 방지, 스펙 §3.2).
 * YoY 계산 위해 item 전체를 읽고 map 조인(품목당 ~138행이라 부담 없음).
 */
export async function getExportSeries(
  itemCode: string,
  from: string,
  to: string,
  metric: ExportMetric
): Promise<ExportSeriesResponse> {
  const all = await prisma.monthlyExport.findMany({
    where: { itemCode },
    orderBy: { yearMonth: "asc" },
    select: {
      yearMonth: true,
      exportUsd: true,
      importUsd: true,
      provisional: true,
      periodLabel: true,
    },
  });

  const valueByYm = new Map<string, number | null>();
  for (const r of all) valueByYm.set(r.yearMonth, metricValue(metric, r.exportUsd, r.importUsd));

  const rows: ExportRow[] = [];
  for (const r of all) {
    if (r.yearMonth < from || r.yearMonth > to) continue;
    const cur = metricValue(metric, r.exportUsd, r.importUsd);
    const prev = valueByYm.get(ymMinus12(r.yearMonth));
    const yoyPct =
      r.provisional || cur === null || prev == null || prev === 0
        ? null
        : parseFloat((((cur - prev) / Math.abs(prev)) * 100).toFixed(1));
    rows.push({
      yearMonth: r.yearMonth,
      value: cur ?? 0,
      yoyPct,
      provisional: r.provisional,
      periodLabel: r.periodLabel,
    });
  }

  const firstAvailable = all.length > 0 ? all[0].yearMonth : null;
  const confirmed = all.filter((r) => !r.provisional);
  const latestConfirmedYm = confirmed.length > 0 ? confirmed[confirmed.length - 1].yearMonth : null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    item: { code: itemCode, name: itemName(itemCode) },
    metric,
    rows,
    summary: {
      firstAvailable,
      latestConfirmedYm,
      latestYm: last?.yearMonth ?? null,
      latestValue: last?.value ?? null,
      latestYoyPct: last?.yoyPct ?? null,
      latestProvisional: last?.provisional ?? false,
    },
  };
}

/**
 * 특정 월 품목 랭킹. metric 값 내림차순. 잠정월 미커버 품목은 rows 부재(랭킹 제외),
 * coverage 로 반영 품목 수 안내(스펙 §5). 잠정 행 YoY 는 null.
 */
export async function getExportRanking(
  ym: string,
  metric: ExportMetric,
  top: number
): Promise<ExportRankingResponse> {
  const prevYm = ymMinus12(ym);
  const [cur, prev] = await Promise.all([
    prisma.monthlyExport.findMany({
      where: { yearMonth: ym },
      select: {
        itemCode: true,
        exportUsd: true,
        importUsd: true,
        provisional: true,
      },
    }),
    prisma.monthlyExport.findMany({
      where: { yearMonth: prevYm },
      select: { itemCode: true, exportUsd: true, importUsd: true },
    }),
  ]);

  const prevVal = new Map<string, number | null>();
  for (const r of prev) prevVal.set(r.itemCode, metricValue(metric, r.exportUsd, r.importUsd));

  const scored = cur
    .map((r) => {
      const value = metricValue(metric, r.exportUsd, r.importUsd);
      const p = prevVal.get(r.itemCode);
      const yoyPct =
        r.provisional || value === null || p == null || p === 0
          ? null
          : parseFloat((((value - p) / Math.abs(p)) * 100).toFixed(1));
      return {
        itemCode: r.itemCode,
        itemName: itemName(r.itemCode),
        value: value ?? 0,
        yoyPct,
        provisional: r.provisional,
        _hasValue: value !== null,
      };
    })
    .filter((r) => r._hasValue && r.itemCode !== "ETC")
    .sort((a, b) => b.value - a.value)
    .slice(0, top);

  const rows: RankingRow[] = scored.map((r, i) => ({
    rank: i + 1,
    itemCode: r.itemCode,
    itemName: r.itemName,
    value: r.value,
    yoyPct: r.yoyPct,
    provisional: r.provisional,
  }));

  return {
    ym,
    metric,
    rows,
    coverage: {
      coveredItems: cur.filter((r) => r.itemCode !== "ETC").length,
      totalItems: ITEM_GROUPS.filter((g) => g.code !== "ETC").length,
      provisional: cur.some((r) => r.provisional),
    },
  };
}

/** 메타: 지원 품목목록 + 최초월 + 최신 확정월(UI 기본값·잠정 판별용). */
export async function getExportMeta(): Promise<ExportMetaResponse> {
  const [first, latestConfirmed] = await Promise.all([
    prisma.monthlyExport.findFirst({
      orderBy: { yearMonth: "asc" },
      select: { yearMonth: true },
    }),
    prisma.monthlyExport.findFirst({
      where: { provisional: false },
      orderBy: { yearMonth: "desc" },
      select: { yearMonth: true },
    }),
  ]);
  return {
    items: ITEM_GROUPS.map((g) => ({ code: g.code, name: g.name })),
    firstAvailable: first?.yearMonth ?? null,
    latestConfirmedYm: latestConfirmed?.yearMonth ?? null,
  };
}
