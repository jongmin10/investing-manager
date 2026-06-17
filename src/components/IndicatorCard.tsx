"use client";

import { useState } from "react";
import ChartModal from "./ChartModal";
import { INDICATORS, IndicatorType, formatValue, isAnomaly } from "@/lib/indicators";

interface IndicatorData {
  type: IndicatorType;
  value: number;
  recordedAt: string;
  change: number;
  changePercent: number;
}

const FREQUENCY_LABEL: Record<string, string> = {
  realtime: "실시간",
  daily: "매일",
  monthly: "월별",
  event: "이벤트",
};

export default function IndicatorCard({ data }: { data: IndicatorData }) {
  const [modalOpen, setModalOpen] = useState(false);

  const meta = INDICATORS[data.type];
  const anomaly = isAnomaly(data.type, data.value);
  const isPositive = data.change > 0;
  const isNeutral = data.change === 0;

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={`rounded-xl border bg-white shadow-sm flex flex-col gap-2 p-4 cursor-pointer
          transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]
          ${anomaly ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-blue-300"}`}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-800 text-sm">{meta.name}</span>
              {anomaly && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  주의
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {meta.source} · {FREQUENCY_LABEL[meta.frequency]}
            </p>
          </div>
          <span className="text-[11px] text-blue-400 shrink-0 mt-0.5">상세 →</span>
        </div>

        {/* 현재값 + 변화 */}
        <div className="flex items-end gap-2">
          <span
            className={`text-2xl font-bold tabular-nums ${anomaly ? "text-red-600" : "text-gray-900"}`}
          >
            {formatValue(data.type, data.value)}
          </span>
          <span
            className={`text-xs font-medium pb-0.5 ${
              isNeutral ? "text-gray-400" : isPositive ? "text-red-500" : "text-blue-500"
            }`}
          >
            {isNeutral ? "—" : isPositive ? "▲" : "▼"}{" "}
            {Math.abs(data.change).toFixed(meta.decimalPlaces)}{" "}
            ({isPositive ? "+" : ""}
            {data.changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {modalOpen && (
        <ChartModal data={data} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
