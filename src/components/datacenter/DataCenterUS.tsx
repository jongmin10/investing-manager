"use client";

import {
  Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, AreaChart, Area,
} from "recharts";
import AiTokenIndex from "@/components/datacenter/AiTokenIndex";
import type {
  CapexPoint, PowerPoint, DCCountPoint, SemiconPoint, SdllmtkPoint, DCSummary,
} from "@/lib/datacenter";

interface Props {
  summary: DCSummary;
  capexSeries: CapexPoint[];
  powerSeries: PowerPoint[];
  dcCountSeries: DCCountPoint[];
  semiconSeries: SemiconPoint[];
  sdllmtkSeries: SdllmtkPoint[];
}

const COMPANY_COLORS = {
  msft: "#0078d4",
  amzn: "#ff9900",
  goog: "#34a853",
  meta: "#1877f2",
};

function pct(a: number | null, b: number | null): string {
  if (!a || !b || b === 0) return "—";
  return `${((a - b) / b) * 100 >= 0 ? "+" : ""}${(((a - b) / b) * 100).toFixed(1)}%`;
}

function SummaryCard({
  label, value, sub, subColor,
}: {
  label: string;
  value: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className={`text-xs mt-1 ${subColor ?? "text-gray-400"}`}>{sub}</p>
    </div>
  );
}

function capexMomentum(series: CapexPoint[]): string {
  if (series.length < 2) return "데이터 수집 중";
  const last = series[series.length - 1].total;
  const prev = series[series.length - 2].total;
  const chg = ((last - prev) / prev) * 100;
  if (chg >= 15) return "↑↑ 강한 상승";
  if (chg >= 5)  return "↑ 상승";
  if (chg >= -5) return "→ 보합";
  if (chg >= -15)return "↓ 하락";
  return "↓↓ 강한 하락";
}

function momentumColor(m: string): string {
  if (m.startsWith("↑↑")) return "text-emerald-600";
  if (m.startsWith("↑"))  return "text-green-600";
  if (m.startsWith("→"))  return "text-gray-500";
  return "text-red-500";
}

// 분기 레이블 포맷 "2025Q1" → "25Q1"
function fmtQ(p: string) {
  return p.replace(/^20/, "");
}

// 월 레이블 포맷 "2025-06" → "'25.6" (연도 항상 표시해 2년치 구분)
function fmtM(p: string) {
  const [y, m] = p.split("-");
  return `'${y.slice(2)}.${parseInt(m)}`;
}

export default function DataCenterUS({
  summary, capexSeries, powerSeries, dcCountSeries, semiconSeries, sdllmtkSeries,
}: Props) {
  const momentum = capexMomentum(capexSeries);

  // 상관 차트: Capex 분기 합산을 월로 근사 배치 (같은 x축으로 표현)
  const corrData = semiconSeries.map((s) => {
    // 같은 기간 Capex 찾기 (월 → 분기 매핑)
    const [y, mo] = s.period.split("-").map(Number);
    const q = `${y}Q${Math.ceil(mo / 3)}`;
    const capex = capexSeries.find((c) => c.period === q)?.total ?? null;
    return { period: s.period, semicon: s.exportUsdB, capex };
  });

  return (
    <div className="space-y-6">
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="미국 DC 총수"
          value={summary.usDcCount ? `${summary.usDcCount.toLocaleString()}개` : "수집 중"}
          sub={
            summary.usDCWoW != null
              ? `WoW ${summary.usDCWoW >= 0 ? "+" : ""}${summary.usDCWoW.toFixed(2)}% · MoM ${summary.usDCMoM != null ? (summary.usDCMoM >= 0 ? "+" : "") + summary.usDCMoM.toFixed(2) + "%" : "—"}`
              : "baxtel.com 기준"
          }
          subColor={summary.usDCWoW != null ? (summary.usDCWoW >= 0 ? "text-emerald-600" : "text-red-500") : undefined}
        />
        <SummaryCard
          label="하이퍼스케일러 Capex"
          value={summary.capexTotalLatest ? `$${summary.capexTotalLatest.toFixed(1)}B/Q` : "수집 중"}
          sub={`QoQ ${pct(summary.capexTotalLatest, summary.capexTotalPrev)}`}
          subColor={summary.capexTotalLatest && summary.capexTotalPrev && summary.capexTotalLatest >= summary.capexTotalPrev ? "text-emerald-600" : "text-red-500"}
        />
        <SummaryCard
          label="버지니아 전력 소비"
          value={summary.powerLatest ? `${Math.round(summary.powerLatest).toLocaleString()} GWh` : "수집 중"}
          sub={`YoY ${pct(summary.powerLatest, summary.powerYoyPeriod)}`}
          subColor={summary.powerLatest && summary.powerYoyPeriod && summary.powerLatest >= summary.powerYoyPeriod ? "text-emerald-600" : "text-red-500"}
        />
        <SummaryCard
          label="AI 투자 모멘텀"
          value={momentum.split(" ").slice(1).join(" ")}
          sub={`${summary.latestCapexPeriod ?? "—"} 기준`}
          subColor={momentumColor(momentum)}
        />
      </div>

      {/* Capex 추이 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          하이퍼스케일러 분기 Capex 추이
        </h3>
        <p className="text-xs text-gray-400 mb-4">MSFT · AMZN · GOOG · Meta 4사 합산 ($B, EDGAR 10-Q)</p>
        {capexSeries.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={capexSeries.map((d) => ({ ...d, period: fmtQ(d.period) }))}>
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}B`} width={48} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(1)}B`, String(v)]}
                  labelFormatter={(label, payload) => {
                    const isPartial = payload?.[0]?.payload?.partial;
                    return isPartial ? `${label} ※MSFT만 집계` : String(label);
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="msft" name="MSFT" stackId="a" fill={COMPANY_COLORS.msft} radius={[0,0,0,0]} />
                <Bar dataKey="amzn" name="AMZN" stackId="a" fill={COMPANY_COLORS.amzn} />
                <Bar dataKey="goog" name="GOOG" stackId="a" fill={COMPANY_COLORS.goog} />
                <Bar dataKey="meta" name="META" stackId="a" fill={COMPANY_COLORS.meta} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="total" name="합산" stroke="#374151" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
            {capexSeries.some((d) => d.partial) && (
              <p className="text-[10px] text-gray-400 mt-1">
                ※ Q4(10~12월): AMZN·GOOG·META는 연간보고서(10-K) 보고 — MSFT 단독 집계
              </p>
            )}
          </>
        )}
      </div>

      {/* SDLLMTK: AI 실수요 지수 */}
      <AiTokenIndex series={sdllmtkSeries} />

      {/* 버지니아 전력 추이 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          버지니아 전력 수요 추이
        </h3>
        <p className="text-xs text-gray-400 mb-4">월별 소매전력 판매량 (GWh, EIA) · Northern Virginia = 미국 최대 DC 집적지</p>
        {powerSeries.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={powerSeries.map((d) => ({ ...d, label: fmtM(d.period) }))}>
              <defs>
                <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={2} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} width={40} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => [`${Math.round(Number(v)).toLocaleString()} GWh`, "버지니아 전력"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#powerGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 미국 DC 수 추이 */}
      {dcCountSeries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">미국 데이터센터 수 추이</h3>
          <p className="text-xs text-gray-400 mb-4">수집 이력 (datacentermap.com)</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={dcCountSeries.map((d) => ({ ...d, label: d.period }))}>
              <defs>
                <linearGradient id="dcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} width={50} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}개`, "DC 수"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#dcGrad)" dot={{ r: 3, fill: "#10b981" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 반도체 수출 상관 */}
      {corrData.some((d) => d.capex !== null) && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">반도체 수출 상관</h3>
          <p className="text-xs text-gray-400 mb-4">
            하이퍼스케일러 Capex(분기) vs 한국 반도체 수출(월) · 6~12개월 시차 경향
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={corrData.map((d) => ({ ...d, label: fmtM(d.period) }))}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={2} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}B`} width={44} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}B`} width={44} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v, name) => [`$${Number(v).toFixed(1)}B`, String(name)]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="capex" name="Capex합산" fill="#c7d2fe" radius={[2,2,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="semicon" name="반도체 수출" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2 text-right">
            ※ 반도체 수출 데이터: 관세청 신고 미화금액
          </p>
        </div>
      )}

    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-gray-400">
      데이터 수집 중 — 첫 cron 실행 후 표시됩니다
    </div>
  );
}
