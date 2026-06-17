"use client";

import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { INDICATORS, IndicatorType } from "@/lib/indicators";

interface DataPoint {
  value: number;
  recordedAt: string;
}

interface TrendChartProps {
  type: IndicatorType;
  data: DataPoint[];
  mini?: boolean;
}

function formatDate(iso: string, mini: boolean): string {
  const d = new Date(iso);
  if (mini) return `${d.getMonth() + 1}/${d.getDate()}`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function TrendChart({ type, data, mini = false }: TrendChartProps) {
  const meta = INDICATORS[type];
  const color = "#3b82f6";

  const chartData = data.map((d) => ({
    date: formatDate(d.recordedAt, mini),
    value: d.value,
  }));

  /* ── 스파크라인 (카드 내 항상 표시) ── */
  if (mini) {
    return (
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={chartData} margin={{ top: 4, right: 2, left: -40, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${type}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            formatter={(v) => [
              Number(v).toFixed(meta.decimalPlaces) + (meta.unit ? ` ${meta.unit}` : ""),
              meta.name,
            ]}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 11, borderRadius: "8px", border: "1px solid #e5e7eb" }}
          />
          {meta.anomalyThreshold && (
            <ReferenceLine
              y={meta.anomalyThreshold.value}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${type})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  /* ── 모달용 상세 차트 ── */
  const tickInterval = Math.max(1, Math.floor(chartData.length / 7));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-modal-${type}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          interval={tickInterval - 1}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => v.toFixed(meta.decimalPlaces)}
          width={60}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v) => [
            Number(v).toFixed(meta.decimalPlaces) + (meta.unit ? ` ${meta.unit}` : ""),
            meta.name,
          ]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12, borderRadius: "10px", border: "1px solid #e5e7eb" }}
        />
        {meta.anomalyThreshold && (
          <ReferenceLine
            y={meta.anomalyThreshold.value}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{
              value: `임계값 ${meta.anomalyThreshold.value}`,
              fill: "#ef4444",
              fontSize: 11,
              position: "insideTopRight",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-modal-${type})`}
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
