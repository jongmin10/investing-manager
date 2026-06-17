import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INDICATOR_TYPES, IndicatorType } from "@/lib/indicators";

export async function GET() {
  try {
    // 각 지표의 최신값 2개 조회 (현재값 + 직전값)
    const results = await Promise.all(
      INDICATOR_TYPES.map(async (type) => {
        const records = await prisma.indicatorRecord.findMany({
          where: { type },
          orderBy: { recordedAt: "desc" },
          take: 2,
        });

        const current = records[0];
        const previous = records[1];

        if (!current) return null;

        const change = previous ? current.value - previous.value : 0;
        const changePercent = previous && previous.value !== 0
          ? ((current.value - previous.value) / previous.value) * 100
          : 0;

        return {
          type: type as IndicatorType,
          value: current.value,
          recordedAt: current.recordedAt,
          change,
          changePercent,
        };
      })
    );

    return NextResponse.json(results.filter(Boolean));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
