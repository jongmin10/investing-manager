"use client";

import {
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
  // 10000 이상: K 단위 (NASDAQ100 등)
  if (v >= 10000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  // 1000~9999: 정수 그대로 표시. K 단위로 축약하면 환율(1310·1320·1330 → 모두 "1.3K")처럼
  // 틱 라벨이 겹쳐 Y축을 읽을 수 없으므로 풀 숫자를 사용한다.
  if (v >= 1000) {
    return v.toFixed(0);
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

  // 대형 숫자(주가지수·환율 등) Y축 여백 동적 계산. 빈 데이터 방어
  const maxVal = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 0;
  // 1000~9999는 4자리 정수 표시 → 10000+ K 표기보다 더 넓은 여백 필요
  const yWidth = maxVal >= 10000 ? 48 : maxVal >= 1000 ? 56 : 60;

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
