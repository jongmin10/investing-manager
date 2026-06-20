import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INDICATOR_TYPES, IndicatorType } from "@/lib/indicators";

export const revalidate = 300; // 5분 캐싱

export async function GET() {
  try {
    // 단일 쿼리로 전체 타입 최신 데이터 조회
    const allRecords = await prisma.indicatorRecord.findMany({
      where:   { type: { in: [...INDICATOR_TYPES] } },
      orderBy: { recordedAt: "desc" },
    });

    // 타입별로 최신 2개씩 추출
    const byType = new Map<string, typeof allRecords>();
    for (const r of allRecords) {
      const list = byType.get(r.type) ?? [];
      if (list.length < 2) {
        list.push(r);
        byType.set(r.type, list);
      }
    }

    const results = INDICATOR_TYPES.map((type) => {
      const records = byType.get(type) ?? [];
      const current  = records[0];
      const previous = records[1];
      if (!current) return null;

      const change = previous ? current.value - previous.value : 0;
      const changePercent = previous && previous.value !== 0
        ? ((current.value - previous.value) / previous.value) * 100
        : 0;

      return { type: type as IndicatorType, value: current.value, recordedAt: current.recordedAt, change, changePercent };
    });

    return NextResponse.json(results.filter(Boolean));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
