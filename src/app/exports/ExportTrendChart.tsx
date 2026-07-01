"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ExportRow, ExportMetric } from "@/lib/exports";
import { formatExportUsd } from "@/lib/exports";

const METRIC_LABEL: Record<ExportMetric, string> = {
  export: "수출",
  import: "수입",
  balance: "무역수지",
};

interface Point {
  ym: string;
  value: number; // 억$ 단위 (표시용)
  raw: number; // 원값 USD
  yoy: number | null;
  provisional: boolean;
}

export default function ExportTrendChart({
  rows,
  metric,
  itemName,
}: {
  rows: ExportRow[];
  metric: ExportMetric;
  itemName: string;
}) {
  const [showYoy, setShowYoy] = useState(true);
  const label = METRIC_LABEL[metric];

  const data = useMemo<Point[]>(
    () =>
      rows.map((r) => ({
        ym: r.yearMonth,
        value: parseFloat((r.value / 1e8).toFixed(1)),
        raw: r.value,
        yoy: r.yoyPct,
        provisional: r.provisional,
      })),
    [rows]
  );

  // 연도 경계 눈금(각 연도 첫 데이터월)을 명시 지정 → ~8개로 솎아 연도 라벨 표시.
  const yearTicks = useMemo(() => {
    const seen = new Set<number>();
    const firstOfYear: string[] = [];
    for (const d of data) {
      const y = +d.ym.slice(0, 4);
      if (!seen.has(y)) { seen.add(y); firstOfYear.push(d.ym); }
    }
    const step = Math.max(1, Math.ceil(firstOfYear.length / 8));
    return firstOfYear.filter((_, i) => i % step === 0);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center text-sm text-gray-400">
        차트 데이터가 없습니다.
      </div>
    );
  }

  // 5년(60개월) 초과 구간은 밀도 문제로 막대 대신 라인
  const useLine = data.length > 60;
  const hasYoy = data.some((d) => d.yoy !== null);

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm p-4"
      aria-label={`${itemName} ${label} 추세 차트`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            {itemName} 월별 {label} 추세
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            단위 억$ · {useLine ? "라인(장기)" : "막대"} · 당월 잠정은 반투명
          </p>
        </div>
        {hasYoy && (
          <button
            onClick={() => setShowYoy((v) => !v)}
            aria-pressed={showYoy}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showYoy
                ? "bg-blue-500 text-white border-blue-500"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            YoY {showYoy ? "표시" : "숨김"}
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="ym"
            ticks={yearTicks}
            tickFormatter={(ym: string) => ym.slice(0, 4)}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          {showYoy && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
            />
          )}
          <Tooltip
            formatter={(val, name) =>
              name === "YoY"
                ? [`${Number(val).toFixed(1)}%`, "YoY"]
                : [formatExportUsd(Number(val) * 1e8), label]
            }
            labelFormatter={(ym) => String(ym)}
            contentStyle={{
              fontSize: 12,
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          />
          {showYoy && <ReferenceLine yAxisId="right" y={0} stroke="#e5e7eb" />}

          {useLine ? (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="value"
              name={label}
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
            />
          ) : (
            <Bar yAxisId="left" dataKey="value" name={label} radius={[2, 2, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill="#3b82f6" fillOpacity={d.provisional ? 0.4 : 1} />
              ))}
            </Bar>
          )}

          {showYoy && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="yoy"
              name="YoY"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
