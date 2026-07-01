import {
  getMonthlyReturns,
  getChartSeries,
  currentYearMonth,
  isMonthlySeries,
  isValidYearMonth,
  DEFAULT_FROM,
} from "@/lib/monthly-returns";
import ReturnsControls from "./ReturnsControls";
import ReturnsHeatmap from "./ReturnsHeatmap";
import SummaryCards from "./SummaryCards";
// CumulativeChart 는 "use client" — 서버 컴포넌트에서 직접 import 가능 (SSR 스킵됨)
import CumulativeChart from "./CumulativeChart";

// searchParams 가 Promise 인 Next.js 16 — await 필수
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const rawSeries = typeof sp.series === "string" ? sp.series : "KOSPI";
  const series = isMonthlySeries(rawSeries) ? rawSeries : "KOSPI";

  const rawFrom = typeof sp.from === "string" ? sp.from : "";
  const rawTo = typeof sp.to === "string" ? sp.to : "";
  const from = isValidYearMonth(rawFrom) ? rawFrom : DEFAULT_FROM;
  const to = isValidYearMonth(rawTo) ? rawTo : currentYearMonth();

  const [data, chart] = await Promise.all([
    getMonthlyReturns(series, from, to),
    getChartSeries(series, from, to),
  ]);

  return (
    <div className="space-y-6">
      {/* 헤더 + 컨트롤 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            2000년 이후 지수 수익률
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            배당 미반영 · 가격수익률 기준 · 지수 종가(Yahoo Finance)
          </p>
        </div>
        <ReturnsControls series={series} from={from} to={to} />
      </div>

      {/* 요약 카드 */}
      <SummaryCards summary={data.summary} />

      {/* 연×월 히트맵 */}
      <ReturnsHeatmap rows={data.rows} firstAvailable={data.firstAvailable} />

      {/* 누적 수익률 라인 차트 (클라이언트, Recharts 지연 로드) — 구간 짧으면 일단위 자동 */}
      <CumulativeChart
        points={chart.points}
        granularity={chart.granularity}
        series={series}
      />
      {/* 면책조항은 layout.tsx footer 에서 전역 렌더 — 페이지 중복 제거 */}
    </div>
  );
}
