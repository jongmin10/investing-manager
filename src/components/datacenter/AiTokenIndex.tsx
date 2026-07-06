"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SdllmtkPoint } from "@/lib/datacenter";

interface Props {
  series: SdllmtkPoint[];
}

function fmtDate(period: string) {
  const [, m, d] = period.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

function changePct(series: SdllmtkPoint[]): number | null {
  if (series.length < 2) return null;
  const cur = series[series.length - 1].value;
  const prev = series[series.length - 2].value;
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export default function AiTokenIndex({ series }: Props) {
  const latest = series[series.length - 1];
  const chg = changePct(series);
  const latestDate = latest ? new Date(latest.period).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : null;

  const isAnomaly = chg !== null && Math.abs(chg) >= 10;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${isAnomaly ? "border-orange-300" : "border-gray-100"}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            AI 실수요 지수 (SDLLMTK)
          </h3>
          <p className="text-xs text-gray-400">
            LLM 토큰 지출 가중평균 · Silicon Data · Bloomberg: SDLLMTK
          </p>
        </div>
        {latestDate && (
          <span className="text-xs text-gray-400">{latestDate} 기준</span>
        )}
      </div>

      {series.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-gray-400">
          데이터 수집 중 — 첫 cron 실행 후 표시됩니다
        </div>
      ) : (
        <>
          {/* 요약 수치 */}
          <div className="flex items-end gap-3 mb-4">
            <span className="text-3xl font-bold text-gray-900">
              ${latest.value.toFixed(2)}
            </span>
            <span className="text-sm text-gray-400 pb-1">USD / 100만 토큰</span>
            {chg !== null && (
              <span className={`text-sm font-medium pb-1 ${chg >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% (전일)
              </span>
            )}
          </div>

          {isAnomaly && (
            <p className="text-xs text-orange-600 mb-3">
              ⚠ 전일 대비 ±10% 초과 급변 — LLM 시장 이벤트 확인 권장
            </p>
          )}

          {/* 트렌드 차트 */}
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={series.map((d) => ({ ...d, label: fmtDate(d.period) }))}>
              <defs>
                <linearGradient id="sdllmtkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={Math.max(0, Math.floor(series.length / 10) - 1)}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                width={52}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v) => [`$${Number(v).toFixed(4)} / 100만 토큰`, "SDLLMTK"]}
                labelFormatter={(label) => `${label}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#sdllmtkGrad)"
                dot={series.length <= 14 ? { r: 3, fill: "#8b5cf6" } : false}
              />
            </AreaChart>
          </ResponsiveContainer>

          <p className="text-[10px] text-gray-400 mt-2">
            지수 상승 = AI 추론 수요 증가 또는 고성능 모델 채택 확대 /
            지수 하락 = 오픈웨이트 모델 전환 또는 수요 둔화
          </p>
        </>
      )}
    </div>
  );
}
