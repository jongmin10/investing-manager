import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { INDICATOR_TYPES, IndicatorType } from "@/lib/indicators";
import { REALTIME_SYMBOLS } from "@/lib/collector";
import { generateMarketSummary } from "@/lib/analysis";
import {
  getDCCapexSeries,
  getDCPowerSeries,
  getDCCountUsSeries,
  getDCCountries,
  getDCSummary,
  getSemiconExportSeries,
} from "@/lib/datacenter";
import DashboardTabs from "@/components/DashboardTabs";

export const revalidate = 300;

const getLatestIndicators = unstable_cache(
  async () => {
    const allRecords = await prisma.indicatorRecord.findMany({
      where: { type: { in: [...INDICATOR_TYPES] } },
      orderBy: { recordedAt: "desc" },
    });

    const byType = new Map<string, typeof allRecords>();
    for (const r of allRecords) {
      const list = byType.get(r.type) ?? [];
      if (list.length < 2) {
        list.push(r);
        byType.set(r.type, list);
      }
    }

    return INDICATOR_TYPES.map((type) => {
      const records = byType.get(type) ?? [];
      const current = records[0];
      const previous = records[1];
      if (!current) return null;
      const change = previous ? current.value - previous.value : 0;
      const changePercent =
        previous && previous.value !== 0
          ? ((current.value - previous.value) / previous.value) * 100
          : 0;
      return {
        type: type as IndicatorType,
        value: current.value,
        recordedAt: current.recordedAt.toISOString(),
        change,
        changePercent,
      };
    }).filter(Boolean) as {
      type: IndicatorType;
      value: number;
      recordedAt: string;
      change: number;
      changePercent: number;
    }[];
  },
  ["dashboard-indicators"],
  { revalidate: 300 },
);

const REALTIME_TYPES = new Set<string>(REALTIME_SYMBOLS.map((s) => s.type));

export default async function DashboardPage() {
  const [
    indicators,
    dcSummary,
    capexSeries,
    powerSeries,
    dcCountSeries,
    countries,
    semiconSeries,
  ] = await Promise.all([
    getLatestIndicators(),
    getDCSummary(),
    getDCCapexSeries(),
    getDCPowerSeries(),
    getDCCountUsSeries(),
    getDCCountries(),
    getSemiconExportSeries(),
  ]);

  const realtimeRecord = indicators.find((i) => REALTIME_TYPES.has(i.type));
  const lastUpdated = realtimeRecord?.recordedAt ?? new Date().toISOString();
  const summary = generateMarketSummary(indicators);

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">
          경제지표 · 데이터센터 AI 인프라 지표
        </p>
      </div>

      <Suspense>
        <DashboardTabs
          indicators={indicators}
          summary={summary}
          lastUpdated={lastUpdated}
          dcData={{
            summary: dcSummary,
            capexSeries,
            powerSeries,
            dcCountSeries,
            countries,
            semiconSeries,
          }}
        />
      </Suspense>
    </div>
  );
}
