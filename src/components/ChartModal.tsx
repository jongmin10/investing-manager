"use client";

import { useState, useEffect, useCallback } from "react";
import TrendChart from "./TrendChart";
import { INDICATORS, IndicatorType, formatValue, isAnomaly } from "@/lib/indicators";

interface IndicatorData {
  type: IndicatorType;
  value: number;
  recordedAt: string;
  change: number;
  changePercent: number;
}

interface ChartModalProps {
  data: IndicatorData;
  onClose: () => void;
}

const PERIODS = [
  { key: "1m", label: "1개월" },
  { key: "3m", label: "3개월" },
  { key: "1y", label: "1년" },
  { key: "3y", label: "3년" },
] as const;

export default function ChartModal({ data, onClose }: ChartModalProps) {
  const [period, setPeriod] = useState<string>("1y");
  const [history, setHistory] = useState<{ value: number; recordedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(
    async (p: string) => {
      setLoading(true);
      const res = await fetch(`/api/indicators/${data.type}/history?period=${p}`);
      const json = await res.json();
      setHistory(json);
      setLoading(false);
    },
    [data.type]
  );

  useEffect(() => {
    fetchHistory(period);
  }, [fetchHistory, period]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const meta = INDICATORS[data.type];
  const anomaly = isAnomaly(data.type, data.value);
  const isPositive = data.change > 0;
  const isNeutral = data.change === 0;

  const FREQUENCY_LABEL: Record<string, string> = {
    realtime: "실시간",
    daily: "매 영업일",
    monthly: "월 1회",
    event: "이벤트",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 본문 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className={`px-6 pt-6 pb-4 rounded-t-2xl ${anomaly ? "bg-red-50" : "bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-gray-900">{meta.name}</h2>
                {anomaly && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    주의
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {meta.source} · {FREQUENCY_LABEL[meta.frequency]}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* 현재값 */}
          <div className="flex items-end gap-3 mt-3">
            <span className={`text-3xl font-bold tabular-nums ${anomaly ? "text-red-600" : "text-gray-900"}`}>
              {formatValue(data.type, data.value)}
            </span>
            <span
              className={`text-sm font-medium pb-0.5 ${
                isNeutral ? "text-gray-400" : isPositive ? "text-red-500" : "text-blue-500"
              }`}
            >
              {isNeutral ? "—" : isPositive ? "▲" : "▼"}{" "}
              {Math.abs(data.change).toFixed(meta.decimalPlaces)}
              {" "}({isPositive ? "+" : ""}{data.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* 기간 필터 */}
          <div className="flex gap-2">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium
                  ${period === key
                    ? "bg-blue-500 text-white border-blue-500"
                    : "text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-500"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 차트 */}
          <div className="h-[350px]">
            {loading ? (
              <div className="h-full bg-gray-100 animate-pulse rounded-xl" />
            ) : (
              <TrendChart type={data.type} data={history} mini={false} />
            )}
          </div>

          {/* 설명 */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-600 mb-1">지표 설명</p>
            <p className="text-sm text-gray-700 leading-relaxed">{meta.glossary}</p>
            {meta.anomalyThreshold && (
              <p className="text-xs text-red-500 mt-2">
                ⚠️ 이상 신호 임계값: {meta.anomalyThreshold.value}{meta.unit}{" "}
                {meta.anomalyThreshold.direction === "above" ? "초과" : "미만"} 시 주의
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
