import { prisma } from "@/lib/prisma";
import { EXPORT_GROUPS, collectGroup } from "@/lib/exports-hs";

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
  return result;
}
