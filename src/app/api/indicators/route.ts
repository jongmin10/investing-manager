import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { INDICATOR_TYPES, IndicatorType } from "@/lib/indicators";

const getIndicators = unstable_cache(
  async () => {
    const allRecords = await prisma.indicatorRecord.findMany({
      where:   { type: { in: [...INDICATOR_TYPES] } },
      orderBy: { recordedAt: "desc" },
    });

    const byType = new Map<string, typeof allRecords>();
    for (const r of allRecords) {
      const list = byType.get(r.type) ?? [];
      if (list.length < 2) { list.push(r); byType.set(r.type, list); }
    }

    return INDICATOR_TYPES.map((type) => {
      const records = byType.get(type) ?? [];
      const current  = records[0];
      const previous = records[1];
      if (!current) return null;
      const change = previous ? current.value - previous.value : 0;
      const changePercent = previous && previous.value !== 0
        ? ((current.value - previous.value) / previous.value) * 100 : 0;
      return { type: type as IndicatorType, value: current.value, recordedAt: current.recordedAt, change, changePercent };
    }).filter(Boolean);
  },
  ["indicators-all"],
  { revalidate: 300 }  // 5분 서버 캐시
);

export async function GET() {
  try {
    const results = await getIndicators();
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
