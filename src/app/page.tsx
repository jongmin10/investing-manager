import { prisma } from "@/lib/prisma";
import { INDICATOR_TYPES, INDICATORS, IndicatorType } from "@/lib/indicators";
import IndicatorCard from "@/components/IndicatorCard";

async function getLatestIndicators() {
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
    })
  );

  return results.filter(Boolean) as {
    type: IndicatorType;
    value: number;
    recordedAt: string;
    change: number;
    changePercent: number;
  }[];
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-[11px] text-gray-400 font-medium px-1">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export const revalidate = 900; // 15분 캐시

export default async function DashboardPage() {
  const indicators = await getLatestIndicators();

  const updatedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">경제지표 대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">
            퇴직연금(DC/IRP) 운용에 필요한 핵심 경제지표를 한눈에 확인하세요.
          </p>
        </div>
        <span className="text-xs text-gray-400">기준: {updatedAt}</span>
      </div>

      {/* 지표 그룹: 금리 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">금리</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["BOK_BASE_RATE", "GOV_BOND_3Y", "GOV_BOND_10Y"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["FED_RATE", "US_TREASURY_2Y", "US_TREASURY_10Y"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      {/* 지표 그룹: 주식시장 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">주식시장</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["KOSPI", "KOSDAQ"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["SP500", "NASDAQ100", "SOX"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      {/* 지표 그룹: 물가 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">물가</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["CPI", "PPI"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["US_CPI", "US_PPI"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      {/* 지표 그룹: 경기 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">경기</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {["CLI", "UNEMPLOYMENT", "US_UNEMPLOYMENT"].map((type) => {
            const d = indicators.find((i) => i.type === type);
            return d ? <IndicatorCard key={type} data={d} /> : null;
          })}
        </div>
      </section>

      {/* 지표 그룹: 외환 & 변동성 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">외환 &amp; 변동성</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {["KRW_USD", "VIX", "FEAR_GREED"].map((type) => {
            const d = indicators.find((i) => i.type === type);
            return d ? <IndicatorCard key={type} data={d} /> : null;
          })}
        </div>
      </section>
    </div>
  );
}
