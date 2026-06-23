import { prisma } from "@/lib/prisma";
import type { EtfReturnMap } from "@/lib/portfolio";

/**
 * EtfReturn 테이블 → EtfReturnMap (key → 수익률 3필드).
 * buildEtfRecommendations에 주입한다. 조회 실패 시 빈 맵을 반환해
 * 빌더가 FALLBACK_ETF_RETURNS로 안전하게 보강하도록 한다.
 */
export async function getEtfReturnMap(): Promise<EtfReturnMap> {
  try {
    const rows = await prisma.etfReturn.findMany({
      select: { key: true, cumulativeReturn: true, returnYears: true, returnPeriod: true },
    });
    const map: EtfReturnMap = {};
    for (const r of rows) {
      map[r.key] = {
        cumulativeReturn: r.cumulativeReturn,
        returnYears: r.returnYears,
        returnPeriod: r.returnPeriod,
      };
    }
    return map;
  } catch (err) {
    console.error("[getEtfReturnMap] DB 조회 실패, fallback 사용:", err);
    return {};
  }
}
