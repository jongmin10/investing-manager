import { prisma } from "@/lib/prisma";
import { EXPORT_GROUPS, collectGroup, fetchMonthTotal, fetchSunbyeol } from "@/lib/exports-hs";
import { TOTAL_CODE, itemName } from "@/lib/exports";

// 최근 N개월(정정 흡수) 재조회 → MonthlyExport upsert(provisional=false).
// GW 확정 갱신용(매월 15일경 전월 확정 + 최근월 정정). 순별 잠정은 별도(데이터셋 확정 후).

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function currentYm(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ExportCollectResult {
  monthsBack: number;
  itemsOk: number;
  itemsFailed: number;
  rowsUpserted: number;
  failed: { code: string; error: string }[];
}

/**
 * 최근 monthsBack 개월 구간을 GW 로 재조회해 확정치 갱신.
 * key 는 process.env.CUSTOMS_SERVICE_KEY. 없으면 즉시 반환(에러 격리).
 */
export async function collectExportsRecent(monthsBack = 3): Promise<ExportCollectResult> {
  const key = process.env.CUSTOMS_SERVICE_KEY;
  const result: ExportCollectResult = {
    monthsBack,
    itemsOk: 0,
    itemsFailed: 0,
    rowsUpserted: 0,
    failed: [],
  };
  if (!key) {
    result.failed.push({ code: "*", error: "CUSTOMS_SERVICE_KEY 미설정" });
    return result;
  }

  const cur = currentYm();
  const from = shiftMonth(cur, -monthsBack).replace("-", "");
  const to = cur.replace("-", "");

  for (const g of EXPORT_GROUPS) {
    try {
      const byMonth = await collectGroup(key, g.hs4, from, to, 200);
      const rows = [...byMonth.entries()]
        .filter(([, v]) => v.exp > BigInt(0) || v.imp > BigInt(0))
        .map(([yearMonth, v]) => ({
          itemCode: g.code,
          itemName: g.name,
          yearMonth,
          exportUsd: v.exp,
          importUsd: v.imp,
        }));
      for (const r of rows) {
        await prisma.monthlyExport.upsert({
          where: { itemCode_yearMonth: { itemCode: r.itemCode, yearMonth: r.yearMonth } },
          create: { ...r, provisional: false, periodLabel: null },
          update: { exportUsd: r.exportUsd, importUsd: r.importUsd, provisional: false, periodLabel: null },
        });
      }
      result.itemsOk++;
      result.rowsUpserted += rows.length;
    } catch (e) {
      result.itemsFailed++;
      result.failed.push({ code: g.code, error: (e as Error).message });
    }
  }

  // 월 총수출(TOTAL) 갱신 — 커버율 계산용. 확정월만 저장(미확정월은 총계 부재).
  for (let ym = from; ym <= to; ym = nextYm(ym)) {
    try {
      const t = await fetchMonthTotal(key, ym);
      if (!t) continue;
      const yearMonth = `${ym.slice(0, 4)}-${ym.slice(4)}`;
      await prisma.monthlyExport.upsert({
        where: { itemCode_yearMonth: { itemCode: TOTAL_CODE, yearMonth } },
        create: { itemCode: TOTAL_CODE, itemName: "총수출", yearMonth, exportUsd: t.exp, importUsd: t.imp, provisional: false, periodLabel: null },
        update: { exportUsd: t.exp, importUsd: t.imp },
      });
      result.rowsUpserted++;
    } catch (e) {
      result.failed.push({ code: `${TOTAL_CODE}:${ym}`, error: (e as Error).message });
    }
  }
  return result;
}

// "YYYYMM" 다음 달
function nextYm(ym: string): string {
  let y = +ym.slice(0, 4), m = +ym.slice(4);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}${String(m).padStart(2, "0")}`;
}

/**
 * 순별(10일) 잠정 수출로 미확정 최근월 채우기. 발표일(11/21/익월1)에 호출.
 *   - GW 확정 행이 이미 있는 월은 건너뜀(확정 우선).
 *   - 없으면 순별 9개 품목 + TOTAL 을 provisional=true, periodLabel 로 upsert.
 * 순별 품목은 산업부 MTI 기준이라 HS 근사 과거치보다 다소 클 수 있음(잠정 배지로 구분).
 */
export async function collectProvisional(monthsBack = 2): Promise<ExportCollectResult> {
  const key = process.env.CUSTOMS_SERVICE_KEY;
  const result: ExportCollectResult = { monthsBack, itemsOk: 0, itemsFailed: 0, rowsUpserted: 0, failed: [] };
  if (!key) {
    result.failed.push({ code: "*", error: "CUSTOMS_SERVICE_KEY 미설정" });
    return result;
  }

  const cur = currentYm();
  for (let i = 0; i <= monthsBack; i++) {
    const ymDash = shiftMonth(cur, -i);
    const yyyymm = ymDash.replace("-", "");
    try {
      // GW 확정 행이 이미 있으면 순별로 덮지 않음(확정 우선)
      const confirmed = await prisma.monthlyExport.count({
        where: { yearMonth: ymDash, provisional: false, itemCode: { notIn: [TOTAL_CODE] } },
      });
      if (confirmed > 0) continue;

      const sb = await fetchSunbyeol(key, yyyymm);
      if (!sb) continue;

      for (const [code, usd] of sb.byItem) {
        await prisma.monthlyExport.upsert({
          where: { itemCode_yearMonth: { itemCode: code, yearMonth: ymDash } },
          create: { itemCode: code, itemName: itemName(code), yearMonth: ymDash, exportUsd: usd, importUsd: null, provisional: true, periodLabel: sb.periodLabel },
          update: { exportUsd: usd, provisional: true, periodLabel: sb.periodLabel },
        });
        result.rowsUpserted++;
      }
      // TOTAL(잠정)
      await prisma.monthlyExport.upsert({
        where: { itemCode_yearMonth: { itemCode: TOTAL_CODE, yearMonth: ymDash } },
        create: { itemCode: TOTAL_CODE, itemName: "총수출", yearMonth: ymDash, exportUsd: sb.totalUsd, importUsd: null, provisional: true, periodLabel: sb.periodLabel },
        update: { exportUsd: sb.totalUsd, provisional: true, periodLabel: sb.periodLabel },
      });
      result.rowsUpserted++;
      result.itemsOk++;
    } catch (e) {
      result.itemsFailed++;
      result.failed.push({ code: `SB:${yyyymm}`, error: (e as Error).message });
    }
  }
  return result;
}
