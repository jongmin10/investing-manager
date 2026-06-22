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

function formatYTick(v: number, dp: number): string {
  // 1천 이상은 K 단위. 천 단위를 버리면(예: 14000·14200·14400 → 모두 "14K")
  // 틱이 같은 라벨로 뭉개지므로, 정수가 아니면 소수 1자리로 정확히 표기
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return v.toFixed(dp);
}

function formatTooltipValue(v: number, dp: number, unit: string): string {
  const num = dp === 0 ? v.toLocaleString("ko-KR") : v.toFixed(dp);
  return unit ? `${num} ${unit}` : num;
}

export default function TrendChart({ type, data, mini = false }: TrendChartProps) {
  const meta = INDICATORS[type];
  const color = "#3b82f6";

  const chartData = data.map((d) => ({
    date: formatDate(d.recordedAt, mini),
    value: d.value,
  }));

  /* ── 스파크라인 (카드 내 표시) ── */
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
            formatter={(v) => [formatTooltipValue(Number(v), meta.decimalPlaces, meta.unit), meta.name]}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 11, borderRadius: "8px", border: "1px solid #e5e7eb" }}
          />
          {meta.anomalyThreshold && (
            <ReferenceLine y={meta.anomalyThreshold.value} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
          )}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#grad-${type})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  /* ── 모달용 상세 차트 ── */
  const tickInterval = Math.max(1, Math.floor(chartData.length / 7));

  // 대형 숫자(주가지수 등) Y축 여백 동적 계산
  const maxVal = Math.max(...data.map((d) => d.value));
  const yWidth = maxVal >= 10000 ? 48 : maxVal >= 1000 ? 52 : 60;

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
          tickFormatter={(v) => formatYTick(v, meta.decimalPlaces)}
          width={yWidth}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v) => [formatTooltipValue(Number(v), meta.decimalPlaces, meta.unit), meta.name]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12, borderRadius: "10px", border: "1px solid #e5e7eb" }}
        />
        {meta.anomalyThreshold && (
          <ReferenceLine
            y={meta.anomalyThreshold.value}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: `임계값 ${meta.anomalyThreshold.value}`, fill: "#ef4444", fontSize: 11, position: "insideTopRight" }}
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
