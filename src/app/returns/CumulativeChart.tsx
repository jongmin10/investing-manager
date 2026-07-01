"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MonthlyRow } from "@/lib/monthly-returns";

const SERIES_LABELS: Record<string, string> = {
  KOSPI:  "코스피",
  KOSDAQ: "코스닥",
  DOW:    "다우존스",
  SP500:  "S&P 500",
  NASDAQ: "나스닥",
};

interface ChartPoint {
  ym: string;
  value: number;
}

function buildChartData(rows: MonthlyRow[]): ChartPoint[] {
  if (rows.length === 0) return [];
  const base = rows[0].close;
  if (base === 0 || !isFinite(base)) return [];
  return rows.map((r) => ({
    ym: r.yearMonth,
    value: parseFloat(((r.close / base) * 100).toFixed(2)),
  }));
}

/** X축: 1월에만 연도 레이블 표시 */
function xTickFormatter(ym: string): string {
  return ym.endsWith("-01") ? ym.slice(0, 4) : "";
}

export default function CumulativeChart({
  rows,
  series,
}: {
  rows: MonthlyRow[];
  series: string;
}) {
  const [logScale, setLogScale] = useState(false);
  const chartData = useMemo(() => buildChartData(rows), [rows]);

  const label = SERIES_LABELS[series] ?? series;

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
            시작 시점 = 100 (정규화)
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
            dataKey="ym"
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval="preserveStartEnd"
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
            labelFormatter={(ym) => String(ym)}
            contentStyle={{
              fontSize: 12,
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          />
          <Line
            type="monotone"
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
