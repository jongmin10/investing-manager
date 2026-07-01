"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ChartGranularity, ChartPoint } from "@/lib/monthly-returns";

const SERIES_LABELS: Record<string, string> = {
  KOSPI:  "코스피",
  KOSDAQ: "코스닥",
  DOW:    "다우존스",
  SP500:  "S&P 500",
  NASDAQ: "나스닥",
};

interface Normalized {
  t: string;
  value: number;
}

function buildChartData(points: ChartPoint[]): Normalized[] {
  if (points.length === 0) return [];
  const base = points[0].close;
  if (base === 0 || !isFinite(base)) return [];
  return points.map((p) => ({
    t: p.t,
    value: parseFloat(((p.close / base) * 100).toFixed(2)),
  }));
}

export default function CumulativeChart({
  points,
  granularity,
  series,
}: {
  points: ChartPoint[];
  granularity: ChartGranularity;
  series: string;
}) {
  const [logScale, setLogScale] = useState(false);
  const chartData = useMemo(() => buildChartData(points), [points]);

  const label = SERIES_LABELS[series] ?? series;
  const isDaily = granularity === "daily";
  // 일단위인데 한 달만 걸치면 X축을 일(day)로, 여러 달이면 연-월로 표시
  const singleMonth = useMemo(
    () => new Set(points.map((p) => p.t.slice(0, 7))).size <= 1,
    [points]
  );

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center text-sm text-gray-400">
        차트 데이터가 없습니다.
      </div>
    );
  }

  // 로그 도메인: 0·음수 불가 → 실제 데이터 min/max 기반
  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const yDomain: [number | string, number | string] = logScale
    ? [Math.max(minVal * 0.95, 0.1), maxVal * 1.05]
    : ["auto", "auto"];

  // 월단위: 1월에만 연도. 일단위: 한 달이면 일(DD), 여러 달이면 연-월(YYYY-MM).
  const xTickFormatter = (t: string): string => {
    if (!isDaily) return t.endsWith("-01") ? t.slice(0, 4) : "";
    return singleMonth ? t.slice(8) : t.slice(0, 7);
  };
  // 일단위는 category 축이 조밀해 눈금을 ~8개로 솎아낸다.
  const xInterval: number | "preserveStartEnd" = isDaily
    ? Math.max(0, Math.floor(chartData.length / 8))
    : "preserveStartEnd";

  const granularityNote = isDaily
    ? `일별 종가 · ${points.length}거래일`
    : "월말 종가";

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm p-4"
      aria-label={`${label} 누적 수익률 차트`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            누적 수익률 — {label}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            시작 시점 = 100 (정규화) · {granularityNote}
          </p>
        </div>
        <button
          onClick={() => setLogScale((v) => !v)}
          aria-pressed={logScale}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            logScale
              ? "bg-blue-500 text-white border-blue-500"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {logScale ? "로그축" : "선형축"}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval={xInterval}
            minTickGap={isDaily ? 24 : 5}
          />
          <YAxis
            scale={logScale ? "log" : "auto"}
            domain={yDomain}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)}`, "누적지수"]}
            labelFormatter={(t) => String(t)}
            contentStyle={{
              fontSize: 12,
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          />
          <Line
            type={isDaily ? "linear" : "monotone"}
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
